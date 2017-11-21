/**
 * This module allows to run Promises in a pool with concurrency scaled
 * based on available memory.
 *
 * Input contains:
 * - promiseProducer which is a function that returns promise to be run
 *   in a pool, should return null when there are no more tasks to be run
 * - maxConcurency
 *
 * TODO:
 * - implement autoscaling
 * - fail of any promise should cause main promise to fail ????
 */

import uuid from 'uuid/v4';
import Promise from 'bluebird';
import os from 'os';

import { logDebug } from './utils';

const MEM_CHECK_INTERVAL_MILLIS = 100;
const MIN_FREE_MEMORY_PERC = 0.2;
const SCALE_UP_INTERVAL = 100;
const WAITFOR_MEMORY_MILLIS = 1000;
const MIN_STEPS_TO_MAXIMIZE_CONCURENCY = 10;

// const sum = arr => arr.reduce((total, current) => total + current, 0);
// const avg = arr => sum(arr) / arr.length;

const humanReadable = bytes => Math.round(bytes / 1024 / 1024);

export default class AutoscaledPool {
    constructor(options) {
        const { promiseProducer, maxConcurrency } = options;

        this.resolve = null;
        this.promiseProducer = promiseProducer;
        this.maxConcurrency = maxConcurrency;
        this.concurrency = 1;
        this.runningPromises = {};
        this.runningCount = 0;

        this.freeMemSnapshots = [];
        this.initialMemTaken = null;

        let iteration = 0;
        this.memCheckInterval = setInterval(() => {
            this._autoscale(iteration === SCALE_UP_INTERVAL);
            iteration++;
            if (iteration > SCALE_UP_INTERVAL) iteration = 0;
        }, MEM_CHECK_INTERVAL_MILLIS);
    }

    /**
     * Starts the pool.
     * Returns promise that resolves when whole pool gets finished.
     */
    start() {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                this.initialMemTaken = os.totalmem() - os.freemem();
                this.resolve = resolve;
                this._maybeRunPromise().catch(reject);
            }, WAITFOR_MEMORY_MILLIS);
        });
    }

    _addRunningPromise(id, promise) {
        this.runningPromises[id] = promise;
        this.runningCount++;
    }

    _removeFinishedPromise(id) {
        delete this.runningPromises[id];
        this.runningCount--;
    }

    _autoscale(maybeScaleUp) {
        const freeMem = os.freemem();
        const totalMem = os.totalmem();

        this.freeMemSnapshots = this.freeMemSnapshots.concat(freeMem).slice(-SCALE_UP_INTERVAL);

        logDebug(`AutoscaledPool: ${this.concurrency} ${humanReadable(freeMem)} ${humanReadable(totalMem)} ${freeMem / totalMem}`);

        // Go down.
        if (freeMem / totalMem < MIN_FREE_MEMORY_PERC) {
            if (this.concurrency > 1) {
                this.concurrency --;
                logDebug(`AutoscaledPool: scaling down to ${this.concurrency}`);
            }

        // Maybe go up every N intervals.
        } else if (maybeScaleUp && this.concurrency < this.maxConcurrency) {
            const minFreeMemory = Math.min(...this.freeMemSnapshots);
            const minFreeMemoryPerc = minFreeMemory / totalMem;
            const maxMemTaken = totalMem - minFreeMemory - this.initialMemTaken;
            const memPerInstancePerc = (maxMemTaken / totalMem) / this.concurrency;
            const hasSpaceForInstances = (minFreeMemoryPerc - MIN_FREE_MEMORY_PERC) / memPerInstancePerc;
            const hasSpaceForInstancesFloored = Math.min(
                Math.floor(hasSpaceForInstances),
                Math.floor(this.maxConcurrency / MIN_STEPS_TO_MAXIMIZE_CONCURENCY),
            );

            console.log(`minFreeMemory: ${humanReadable(minFreeMemory)}`);
            console.log(`minFreeMemoryPerc: ${minFreeMemoryPerc}`);
            console.log(`maxMemTaken: ${humanReadable(maxMemTaken)}`);
            console.log(`memPerInstancePerc: ${memPerInstancePerc}`);
            console.log(`hasSpaceForInstances: ${hasSpaceForInstances}`);

            if (hasSpaceForInstancesFloored > 0) {
                this.concurrency = Math.min(this.concurrency + hasSpaceForInstancesFloored, this.maxConcurrency);
                logDebug(`AutoscaledPool: scaling up to ${this.concurrency}`);
            }
        }
    }

    _maybeRunPromise() {
        if (this.runningCount >= this.concurrency) return;

        const promise = this.promiseProducer();

        // We are done.
        if (!promise && this.runningCount === 0) return this.resolve();

        // We are not done but don't want to execute new promise at this point.
        // This may happen when there are less pages in the queue than max concurrency
        // but all of them are being served already.
        if (!promise) return;

        const id = uuid();

        this._addRunningPromise(id, promise);

        promise
            .then((data) => {
                this._removeFinishedPromise(id);
                this._maybeRunPromise();

                return data;
            })
            .catch((err) => {
                logDebug('Promise failed', logDebug);
                this._removeFinishedPromise(id);
                this._maybeRunPromise();

                throw err;
            });

        this._maybeRunPromise();

        return promise;
    }
}
