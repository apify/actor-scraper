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
import { logDebug } from './utils';

export default class AutoscaledPool {
    constructor(options) {
        const { promiseProducer, maxConcurrency } = options;

        this.resolve = null;
        this.promiseProducer = promiseProducer;
        this.maxConcurrency = maxConcurrency;
        this.runningPromises = {};
        this.runningCount = 0;
    }

    /**
     * Starts the pool.
     * Returns promise that resolves when whole pool gets finished.
     */
    start() {
        return new Promise((resolve, reject) => {
            this.resolve = resolve;

            this._maybeRunPromise()
                .catch(reject);
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

    _maybeRunPromise() {
        if (this.runningCount >= this.maxConcurrency) return;

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
