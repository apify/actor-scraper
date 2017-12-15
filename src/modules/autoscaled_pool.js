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
 * - decide if fail of any promise should result whole pool to fail.
 */

import Apify from 'apify';
import uuid from 'uuid/v4';
import Promise from 'bluebird';
import { logDebug, logInfo, logError } from './utils';

const MEM_CHECK_INTERVAL_MILLIS = 100;
const MIN_FREE_MEMORY_PERC = 0.075;
const SCALE_UP_INTERVAL = 100;
const SCALE_DOWN_INTERVAL = 10;
const MEM_INFO_INTERVAL = 600;
const MIN_STEPS_TO_MAXIMIZE_CONCURENCY = 10;
const MAX_CONCURRENCY_STEP = 10;
const MAYBE_RUN_INTERVAL_MILLIS = MEM_CHECK_INTERVAL_MILLIS * SCALE_UP_INTERVAL * 2;

const humanReadable = bytes => `${Math.round(bytes / 1024 / 1024)} MB`;

export default class AutoscaledPool {
    constructor(options) {
        const { promiseProducer, maxConcurrency, minConcurrency } = options;

        this.resolve = null;
        this.promiseProducer = promiseProducer;
        this.maxConcurrency = maxConcurrency;
        this.minConcurrency = Math.min(minConcurrency, maxConcurrency);
        this.concurrency = minConcurrency;
        this.runningPromises = {};
        this.runningCount = 0;
        this.freeBytesSnapshots = [];
        this.maybeRunInterval = null;

        let iteration = 1;

        this.memCheckInterval = setInterval(() => {
            this._autoscale(iteration);
            iteration++;
            if (iteration > MEM_INFO_INTERVAL) iteration = 0;
        }, MEM_CHECK_INTERVAL_MILLIS);
    }

    /**
     * Starts the pool.
     * Returns promise that resolves when whole pool gets finished.
     */
    start() {
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this._maybeRunPromise().catch(reject);

            // This is here because if we scale down to lets say 1. Then after each promise is finished
            // this._maybeRunPromise() doesn't trigger another one. So if that 1 instance stucks it results
            // in whole act to stuck and even after scaling up it never triggers another promise.
            this.maybeRunInterval = setInterval(() => this._maybeRunPromise(), MAYBE_RUN_INTERVAL_MILLIS);
        });
    }

    /**
     * Gets memory info and computes how much we can scale pool to don't exceede the
     * maximal memory.
     *
     * If shouldLogInfo = true then also logs info about memory usage.
     */
    _computeSpaceforInstances(freeBytes, totalBytes, shouldLogInfo) {
        const minFreeBytes = Math.min(...this.freeBytesSnapshots);
        const minFreePerc = minFreeBytes / totalBytes;
        const maxTakenBytes = totalBytes - minFreeBytes;
        const perInstancePerc = (maxTakenBytes / totalBytes) / this.concurrency;
        const hasSpaceForInstances = (minFreePerc - MIN_FREE_MEMORY_PERC) / perInstancePerc;

        if (shouldLogInfo) {
            logInfo(`Memory stats:
- concurency: ${this.concurrency}
- runningCount: ${this.runningCount}
- freeBytes: ${humanReadable(freeBytes)}
- totalBytes: ${humanReadable(totalBytes)}
- minFreeBytes: ${humanReadable(minFreeBytes)}
- minFreePerc: ${minFreePerc}%
- maxTakenBytes: ${humanReadable(maxTakenBytes)}
- perInstancePerc: ${perInstancePerc}%
- hasSpaceForInstances: ${hasSpaceForInstances}`);
        }

        return Math.min(
            Math.floor(hasSpaceForInstances),
            Math.floor(this.maxConcurrency / MIN_STEPS_TO_MAXIMIZE_CONCURENCY),
            MAX_CONCURRENCY_STEP,
        );
    }

    /**
     * Registers running promise.
     */
    _addRunningPromise(id, promise) {
        this.runningPromises[id] = promise;
        this.runningCount++;
    }

    /**
     * Removes finished promise.
     */
    _removeFinishedPromise(id) {
        delete this.runningPromises[id];
        this.runningCount--;
    }

    /**
     * Gets called every MEM_CHECK_INTERVAL_MILLIS and saves number of free bytes in this.freeBytesSnapshots.
     *
     * Every:
     * - SCALE_DOWN_INTERVAL-th call checks memory and possibly scales DOWN by 1.
     * - SCALE_UP_INTERVAL-th call checks memory and possibly scales UP by not more than this.maxConcurrency / MIN_STEPS_TO_MAXIMIZE_CONCURENCY.
     * - MEM_INFO_INTERVAL-th call logs statistics about memory.
     */
    async _autoscale(iteration) {
        const { freeBytes, totalBytes } = await Apify.getMemoryInfo();

        this.freeBytesSnapshots = this.freeBytesSnapshots.concat(freeBytes).slice(-SCALE_UP_INTERVAL);

        // Maybe scale down.
        if (iteration % SCALE_DOWN_INTERVAL === 0 && freeBytes / totalBytes < MIN_FREE_MEMORY_PERC) {
            if (this.concurrency > this.minConcurrency) {
                this.concurrency --;
                logDebug(`AutoscaledPool: scaling down to ${this.concurrency}`);
            }
        }

        // Maybe scale up.
        if (iteration % SCALE_UP_INTERVAL === 0 && this.concurrency < this.maxConcurrency) {
            const hasSpaceForInstances = this._computeSpaceforInstances(freeBytes, totalBytes);

            if (hasSpaceForInstances > 0) {
                this.concurrency = Math.min(this.concurrency + hasSpaceForInstances, this.maxConcurrency);
                logDebug(`AutoscaledPool: scaling up by ${hasSpaceForInstances} to ${this.concurrency}`);
            }
        }

        // Print info about memory
        if (iteration === MEM_INFO_INTERVAL) {
            this._computeSpaceforInstances(freeBytes, totalBytes, true);
        }
    }

    /**
     * If this.runningCount < this.concurrency then gets new promise from this.promiseProducer() and adds it to the pool.
     * If this.promiseProducer() returns null and nothing is running then finishes pool.
     */
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
                logError('Promise failed', err);
                this._removeFinishedPromise(id);
                this._maybeRunPromise();

                throw err;
            });

        this._maybeRunPromise();

        return promise;
    }

    destroy() {
        clearInterval(this.memCheckInterval);
        clearInterval(this.maybeRunInterval);
    }
}
