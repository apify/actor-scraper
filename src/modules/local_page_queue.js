import _ from 'underscore';
import StatefulClass from './stateful_class';
import ListDictionary from './list_dictionary';
import { logDebug, logInfo } from './utils';
import Request, { QUEUE_POSITIONS, PROPERTIES as REQUEST_PROPERTIES } from './request';

export const STATE_KEY = 'STATE-local-page-queue.json';

const DEFAULT_STATE = {
    lastRequestId: 0,
    stats: {
        pagesInQueue: 0,
        pagesCrawled: 0,
        pagesOutputted: 0,
        pagesRetried: 0,
    },
    queued: [],
    handled: [],
};

// TODO: This is temporary ugly solution before we finish the remote PageQueue
// to save some resources when keeping queue in instance memory.
const UNNEEDED_REQUEST_PROPERTIES = _.without(REQUEST_PROPERTIES, 'id', 'uniqueKey', 'url');
const cleanProperties = (request) => {
    UNNEEDED_REQUEST_PROPERTIES.forEach((key) => {
        delete request.data[key];
    });
};

export default class LocalPageQueue extends StatefulClass {
    constructor(state = DEFAULT_STATE, crawlerConfig) {
        super('LocalPageQueue', STATE_KEY);

        const { maxCrawledPages, maxOutputPages } = crawlerConfig;

        this.state = state;
        this.maxOutputPages = maxOutputPages;
        this.maxCrawledPages = maxCrawledPages;
        this.queued = new ListDictionary();
        this.handled = new ListDictionary();

        this.state.queued.forEach((json) => {
            const request = Request.fromJSON(crawlerConfig, json);
            this.queued.add(request.uniqueKey, request);
        });
        this.state.handled.forEach((json) => {
            const request = Request.fromJSON(crawlerConfig, json);

            // TODO: This is temporary ugly solution before we finish the remote PageQueue
            // to save some resources when keeping queue in instance memory.
            cleanProperties(request);

            this.handled.add(request.uniqueKey, request);
        });
    }

    _updateState() {
        this.state.queued = this.queued.toArray().map(request => request.toJSON());
        this.state.handled = this.handled.toArray().map(request => request.toJSON());
    }

    getQueueLength() {
        return this.state.stats.pagesInQueue;
    }

    getPageCount() {
        return this.state.stats.pagesInQueue + this.state.stats.pagesCrawled;
    }

    enqueue(request) {
        const url = request.url;
        const label = JSON.stringify(request.label);
        const info = `(url: ${url}, label: ${label})`;

        logDebug(`PageQueue.enqueue(): ${info}`);

        // Check whether the requested page was already visited...
        const visitedRequest = this.handled.get(request.uniqueKey);
        if (visitedRequest) return logDebug(`PageQueue: Page ${info} was already visited.`);

        // ... or already enqueued.
        const existingRequest = this.queued.get(request.uniqueKey);
        if (existingRequest) return logDebug(`PageQueue: Page ${info} is already in the queue.`);

        logInfo(`PageQueue: Adding page to queue ${info}, queue len: ${this.queued.getLength()}).`);

        request.id = ++this.state.lastRequestId;
        this.queued.add(request.uniqueKey, request, request.queuePosition === QUEUE_POSITIONS.FIRST);
        this._updateState();
        this.state.stats.pagesInQueue = this.queued.getLength();
    }

    fetchNext() {
        const { pagesCrawled, pagesOutputted } = this.state.stats;
        let request = null;

        if (this.maxCrawledPages && this.maxCrawledPages <= pagesCrawled) {
            logDebug(`PageQueue: ${pagesCrawled} pages crawled, reaching the 'maxCrawledPages' limit from the configuration.`);
        } else if (this.maxOutputPages && this.maxOutputPages <= pagesOutputted) {
            logDebug(`PageQueue: ${pagesOutputted} pages outputted, reaching the 'maxOutputPages' limit from the configuration.`);
        } else {
            request = this.queued.moveFirstToEnd();
            const message = request ? 'A request was fetched successfully' : 'No more pages in the queue to crawl.';
            logDebug(`PageQueue: ${message}`);
        }

        this._updateState();

        return request;
    }

    dequeue(request) {
        const stats = this.state.stats;

        logDebug(`PageQueue.markRequestHandled(): request=${request}`);

        if (!request) {
            throw new Error('Parameter "request" must be specified.');
        }
        if (!this.queued.get(request.uniqueKey)) {
            throw new Error(`The request was not found in the queue under this uniqueKey ("${request.uniqueKey}"").`);
        }
        if (this.handled.get(request.uniqueKey)) {
            throw new Error(`There already is a handled request with same uniqueKey ("${request.uniqueKey}"").`);
        }

        this.queued.remove(request.uniqueKey);
        // TODO: This is temporary ugly solution before we finish the remote PageQueue
        // to save some resources when keeping queue in instance memory.
        cleanProperties(request);
        this.handled.add(request.uniqueKey, request);

        stats.pagesInQueue = this.queued.getLength();
        stats.pagesCrawled = this.handled.getLength();
        stats.pagesRetried += (request.retryCount > 0 ? 1 : 0);

        if (!request.skipOutput) {
            stats.pagesOutputted ++;
            this.emit('handled', request);
        }

        this._updateState();
    }

    destroy() {
        super.destroy();
    }
}
