const Apify = require('apify');
const {
    tools,
    createContext,
    constants: { META_KEY },
} = require('@mnmkng/scraper-tools');

const SCHEMA = require('../INPUT_SCHEMA');

const { utils: { log } } = Apify;

const MAX_EVENT_LOOP_OVERLOADED_RATIO = 0.9;

/**
 * Replicates the INPUT_SCHEMA with JavaScript types for quick reference
 * and IDE type check integration.
 *
 * @typedef {Number} Input
 * @property {Object[]} startUrls
 * @property {boolean} useRequestQueue
 * @property {Object[]} pseudoUrls
 * @property {string} linkSelector
 * @property {string} pageFunction
 * @property {Object} proxyConfiguration
 * @property {boolean} debugLog
 * @property {boolean} ignoreSslErrors
 * @property {number} maxRequestRetries
 * @property {number} maxPagesPerCrawl
 * @property {number} maxResultsPerCrawl
 * @property {number} maxCrawlingDepth
 * @property {number} maxConcurrency
 * @property {number} pageLoadTimeoutSecs
 * @property {number} pageFunctionTimeoutSecs
 * @property {Object} customData
 * @property {Array} initialCookies
 */

/**
 * Holds all the information necessary for constructing a crawler
 * instance and creating a context for a pageFunction invocation.
 */
class CrawlerSetup {
    /* eslint-disable class-methods-use-this */
    constructor(input, environment) {
        // Keep this as string to be immutable.
        this.rawInput = JSON.stringify(input);

        // Validate INPUT if not running on Apify Cloud Platform.
        if (!Apify.isAtHome()) tools.checkInputOrThrow(input, SCHEMA);

        /**
         * @type {Input}
         */
        this.input = JSON.parse(this.rawInput);
        this.env = Object.assign({}, environment);

        // Validations
        if (this.input.pseudoUrls.length && !this.input.useRequestQueue) {
            throw new Error('Cannot enqueue links using Pseudo URLs without using a Request Queue. '
                + 'Either select the "Use Request Queue" option to enable Request Queue or '
                + 'remove your Pseudo URLs.');
        }
        this.input.pseudoUrls.forEach((purl) => {
            if (!tools.isPlainObject(purl)) throw new Error('The pseudoUrls Array must only contain Objects.');
            if (purl.userData && !tools.isPlainObject(purl.userData)) throw new Error('The userData property of a pseudoUrl must be an Object.');
        });

        // Side effects
        if (this.input.debugLog) log.setLevel(log.LEVELS.DEBUG);

        // Page Function needs to be evaluated.
        this.evaledPageFunction = tools.evalPageFunctionOrThrow(this.input.pageFunction);

        // Used to store data that persist navigations
        this.globalStore = new GlobalStore();

        // Initialize async operations.
        this.crawler = null;
        this.requestList = null;
        this.requestQueue = null;
        this.dataset = null;
        this.keyValueStore = null;
        this.initPromise = this._initializeAsync();
    }

    async _initializeAsync() {
        // RequestList
        this.requestList = await Apify.openRequestList('CHEERIO-SCRAPER', this.input.startUrls);

        // RequestQueue if selected
        if (this.input.useRequestQueue) this.requestQueue = await Apify.openRequestQueue();

        // Dataset
        this.dataset = await Apify.openDataset();
        const { itemsCount } = await this.dataset.getInfo();
        this.pagesOutputted = itemsCount || 0;

        // KeyValueStore
        this.keyValueStore = await Apify.openKeyValueStore();
    }

    /**
     * Resolves to a CheerioCrawler instance set up with input values.
     *
     * @returns {Promise<CheerioCrawler>}
     */
    async createCrawler() {
        await this.initPromise;

        const options = {
            ...this.input.proxyConfiguration,
            handlePageFunction: this.handlePageFunction.bind(this),
            requestList: this.requestList,
            requestQueue: this.requestQueue,
            // requestFunction: use default,
            handlePageTimeoutSecs: this.input.pageFunctionTimeoutSecs,
            requestTimeoutSecs: this.input.pageLoadTimeoutSecs,
            ignoreSslErrors: this.input.ignoreSslErrors,
            handleFailedRequestFunction: this.handleFailedRequestFunction.bind(this),
            maxRequestRetries: this.input.maxRequestRetries,
            maxRequestsPerCrawl: this.input.maxPagesPerCrawl,
            autoscaledPoolOptions: {
                minConcurrency: MIN_CONCURRENCY,
                maxConcurrency: MAX_CONCURRENCY,
                systemStatusOptions: {
                    // Cheerio does a lot of sync operations, so we need to
                    // give it some time to do its job.
                    maxEventLoopOverloadedRatio: MAX_EVENT_LOOP_OVERLOADED_RATIO,
                },
            },
        };

        this.crawler = new Apify.CheerioCrawler(options);

        return this.crawler;
    }

    async handleFailedRequestFunction({ request }) {
        const lastError = request.errorMessages[request.errorMessages.length - 1];
        const errorMessage = lastError ? lastError.split('\n')[0] : 'no error';
        log.error(`Request ${request.id} failed and will not be retried anymore. Marking as failed.\nLast Error Message: ${errorMessage}`);
        return this._handleResult(request, null, true);
    }

    /**
     * Factory that creates a `handlePageFunction` to be used in the `CheerioCrawler`
     * class.
     *
     * First of all, it initializes the state that is exposed to the user via
     * `pageFunction` context and then it constructs all the context's functions to
     * avoid unnecessary operations with each `pageFunction` call.
     *
     * Then it invokes the user provided `pageFunction` with the prescribed context
     * and saves it's return value.
     *
     * Finally, it makes decisions based on the current state and post-processes
     * the data returned from the `pageFunction`.
     * @param {Object} environment
     * @returns {Function}
     */
    async handlePageFunction({ $, html, request, response }) {
        /**
         * PRE-PROCESSING
         */
        // Make sure that an object containing internal metadata
        // is present on every request.
        tools.ensureMetaData(request);

        // Abort the crawler if the maximum number of results was reached.
        const aborted = await this._handleMaxResultsPerCrawl();
        if (aborted) return;

        // Initialize context and state.
        const { context, state } = createContext(this, { request, response, html, $ });

        /**
         * USER FUNCTION INVOCATION
         */
        const pageFunctionResult = await this.evaledPageFunction(context);

        /**
         * POST-PROCESSING
         */
        // Enqueue more links if Pseudo URLs and a clickable selector are available,
        // unless the user invoked the `skipLinks()` context function
        // or maxCrawlingDepth would be exceeded.
        await this._handleLinks(state, request, $, response);

        // Save the `pageFunction`s result to the default dataset unless
        // the `skipOutput()` context function was invoked.
        if (state.skipOutput) return;
        await this._handleResult(request, pageFunctionResult);
    }

    async _handleMaxResultsPerCrawl() {
        if (!this.input.maxResultsPerCrawl || this.pagesOutputted < this.input.maxResultsPerCrawl) return;
        log.info(`User set limit of ${this.input.maxResultsPerCrawl} results was reached. Finishing the crawl.`);
        await this.crawler.abort();
        return true;
    }

    async _handleLinks(state, request, $, response) {
        const currentDepth = request.userData[META_KEY].depth;
        const hasReachedMaxDepth = this.input.maxCrawlingDepth && currentDepth >= this.input.maxCrawlingDepth;
        if (hasReachedMaxDepth) {
            log.debug(`Request ${request.id} reached the maximum crawling depth of ${currentDepth}.`);
            return;
        }
        const canEnqueue = !state.skipLinks && this.input.pseudoUrls.length && this.input.linkSelector;
        if (!canEnqueue) return;

        await Apify.utils.enqueueLinks({
            $,
            linkSelector: this.input.linkSelector,
            pseudoUrls: this.input.pseudoUrls,
            requestQueue: this.requestQueue,
            baseUrl: response.request.uri.href,
            userData: {
                [META_KEY]: {
                    parentRequestId: request.id,
                    depth: currentDepth + 1,
                },
            },
        });
    }

    async _handleResult(request, pageFunctionResult, isError) {
        const payload = tools.createDatasetPayload(request, pageFunctionResult, isError);
        await Apify.pushData(payload);
        this.pagesOutputted++;
    }
}

module.exports = CrawlerSetup;
