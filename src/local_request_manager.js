/**
 * This module defines the LocalRequestManager class which is an implementation of request manager
 * that stores all requests locally in a list-dictionary data structure and emits processed
 * requests to a JSON output file (@TODO).
 */

import ListDictionary from './list_dictionary';
import { logDebug, logInfo, isNullOrUndefined } from './utils';

export default class LocalRequestManager {
    /**
     * Accepts:
     * - maxCrawledPages
     * - maxOutputPages
     */
    constructor(config = {}) {
        this.config = config;

        // Queued and handled requests in both lists, key is url, value is a Request object
        this.queuedRequests = new ListDictionary();
        this.handledRequests = new ListDictionary();

        // A counter to generate unqiue request IDs
        this.lastRequestId = 0;

        // Various statistics
        this.stats = {
            pagesInQueue: 0,
            pagesCrawled: 0,
            pagesOutputted: 0,
            pagesRetried: 0,
        };

        // Indicates that at least one request was written to output.
        this.outputHasSomeRecords = false;
    }

    /**
     * Notifies the manager about a new page request.
     */
    addNewRequest(request) {
        logDebug(`LocalRequestManager.addNewRequest(): request=${request}`);

        // Check whether the requested page was already visited...
        const visitedRequest = this.handledRequests.get(request.uniqueKey);
        if (visitedRequest) return logDebug('LocalRequestManager.addNewRequest(): Page was already visited.');

        // ... or already enqueued.
        const existingRequest = this.queuedRequests.get(request.uniqueKey);
        if (existingRequest) return logDebug('LocalRequestManager.addNewRequest(): Page is already in the queue.');

        const label = JSON.stringify(request.label);
        const url = request.url;
        const queueLen = this.queuedRequests.length();
        logInfo(`Adding page to queue (url: ${url}, request: ${request}, label: ${label})}, queue len: ${queueLen}).`);

        request.id = ++this.lastRequestId;
        this.queuedRequests.add(request.uniqueKey, request);
    }


    /**
     * Fetches a request from the queue and @TODO
     */
    fetchNextRequest() {
        let request = null;

        if (!isNullOrUndefined(this.config.maxCrawledPages) && this.config.maxCrawledPages <= this.handledRequests.length()) {
            const count = this.handledRequests.length();
            logDebug(`LocalRequestManager.fetchNextRequest(): ${count} pages crawled, reaching the 'maxCrawledPages' limit from the configuration.`);

            // this is necessary if we're the master process,
            // otherwise the master would continue spawning new slaves!
            this.queuedRequests.clear(); // @TODO maybe not needed!!!!
        } else if (!isNullOrUndefined(this.config.maxOutputPages) && this.config.maxOutputPages <= this.stats.pagesOutputted) {
            const count = this.stats.pagesOutputted;
            logDebug(`LocalRequestManager.fetchNextRequest(): ${count} pages outputted, reaching the 'maxOutputPages' limit from the configuration.`);
            this.queuedRequests.clear(); // @TODO maybe not needed!!!!
        } else {
            // note that LocalRequestManager is also used by control server when parallelizing crawling
            // among more processes, therefore we move the returned 'request' to the end of the queue
            // to give the calling slave process some time to process the request, before other process
            // gets its chance
            // @TODO update comment ^
            request = this.queuedRequests.moveFirstToEnd();

            const message = request ? 'A request was fetched successfully' : 'No more pages in the queue to crawl.';
            logDebug(`LocalRequestManager.fetchNextRequest(): ${message}`);
        }

        return request;
    }

    /**
     * A helper function that determines whether a request is in queuedRequests.
     * @param request
     */
    inQueue(request) {
        return !isNullOrUndefined(request) && this.queuedRequests.get(request.uniqueKey) !== null;
    }

    /**
     * Notifies the manager that a request has been handled.
     * @param request
     */
    markRequestHandled(request) {
        logDebug(`LocalRequestManager.markRequestHandled(): request=${request}`);

        if (!request) throw new Error('Parameter "request" must be specified.');
        if (!this.queuedRequests.get(request.uniqueKey)) {
            throw new Error(`The request was not found in the queue under this uniqueKey ("${request.uniqueKey}"").`);
        }
        if (this.handledRequests.get(request.uniqueKey)) {
            throw new Error(`There already is a handled request with same uniqueKey ("${request.uniqueKey}"").`);
        }

        // 'handle' the request
        this.queuedRequests.remove(request.uniqueKey);
        this.handledRequests.add(request.uniqueKey, request);

        // update stats
        this.stats.pagesInQueue = this.queuedRequests.length();
        this.stats.pagesCrawled = this.handledRequests.length();
        // @TODO this.stats.pagesRetried += (request._retryCount > 0 ? 1 : 0); // @TODO
    }
}
