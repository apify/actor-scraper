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

import Apify from 'apify';
import uuid from 'uuid/v4';
import Promise from 'bluebird';
import { logDebug, logInfo, logError } from './utils';

const MEM_CHECK_INTERVAL_MILLIS = 100;
const MIN_FREE_MEMORY_PERC = 0.05;
const SCALE_UP_INTERVAL = 100;
const SCALE_DOWN_INTERVAL = 10;
const SCALE_INFO_INTERVAL = 600;
const MIN_STEPS_TO_MAXIMIZE_CONCURENCY = 10;
const MAX_CONCURRENCY_STEP = 10;

const humanReadable = bytes => `${Math.round(bytes / 1024 / 1024)} MB`;

export default class AutoscaledPool {
    constructor(options) {
        const { promiseProducer, maxConcurrency } = options;

        this.resolve = null;
        this.promiseProducer = promiseProducer;
        this.maxConcurrency = maxConcurrency;
        this.concurrency = 1;
        this.runningPromises = {};
        this.runningCount = 0;
        this.freeBytesSnapshots = [];

        let iteration = 0;
        // TODO: clear interval
        this.memCheckInterval = setInterval(() => {
            this._autoscale(
                iteration % SCALE_DOWN_INTERVAL === 0,
                iteration % SCALE_UP_INTERVAL === 0,
                !process.env.SKIP_DEBUG_LOG || iteration === SCALE_INFO_INTERVAL,
            );
            iteration++;
            if (iteration > SCALE_INFO_INTERVAL) iteration = 0;
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

    async _autoscale(maybeScaleDown, maybeScaleUp, shouldLogInfo) {
        const { freeBytes, totalBytes } = await Apify.getMemoryInfo();

        this.freeBytesSnapshots = this.freeBytesSnapshots.concat(freeBytes).slice(-SCALE_UP_INTERVAL);

        // Go down.
        if (maybeScaleDown && freeBytes / totalBytes < MIN_FREE_MEMORY_PERC) {
            if (this.concurrency > 1) {
                this.concurrency --;
                logDebug(`AutoscaledPool: scaling down to ${this.concurrency}`);
            }

        // Maybe go up every N intervals.
        } else if (maybeScaleUp && this.concurrency < this.maxConcurrency) {
            const minFreeBytes = Math.min(...this.freeBytesSnapshots);
            const minFreePerc = minFreeBytes / totalBytes;
            const maxTakenBytes = totalBytes - minFreeBytes;
            const perInstancePerc = (maxTakenBytes / totalBytes) / this.concurrency;
            const hasSpaceForInstances = (minFreePerc - MIN_FREE_MEMORY_PERC) / perInstancePerc;
            const hasSpaceForInstancesFloored = Math.min(
                Math.floor(hasSpaceForInstances),
                Math.floor(this.maxConcurrency / MIN_STEPS_TO_MAXIMIZE_CONCURENCY),
                MAX_CONCURRENCY_STEP,
            );

            if (shouldLogInfo) {
                logInfo(`Memory stats:
    freeBytes: ${humanReadable(freeBytes)}
    totalBytes: ${humanReadable(totalBytes)}
    minFreeBytes: ${humanReadable(minFreeBytes)}
    minFreePerc: ${minFreePerc}%
    maxTakenBytes: ${humanReadable(maxTakenBytes)}
    perInstancePerc: ${perInstancePerc}%
    hasSpaceForInstances: ${hasSpaceForInstances}`);
            }

            if (hasSpaceForInstancesFloored > 0) {
                this.concurrency = Math.min(this.concurrency + hasSpaceForInstancesFloored, this.maxConcurrency);
                logDebug(`AutoscaledPool: scaling up by ${hasSpaceForInstancesFloored} to ${this.concurrency}`);
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
                logError('Promise failed', err);
                this._removeFinishedPromise(id);
                this._maybeRunPromise();

                throw err;
            });

        this._maybeRunPromise();

        return promise;
    }
}
