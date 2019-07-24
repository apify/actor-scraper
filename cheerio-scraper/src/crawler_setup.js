const Apify = require('apify');
const _ = require('underscore');
const {
    tools,
    createContext,
    constants: { META_KEY },
} = require('@apify/scraper-tools');

const SCHEMA = require('../INPUT_SCHEMA');

const { utils: { log } } = Apify;

const MAX_EVENT_LOOP_OVERLOADED_RATIO = 0.9;

/**
 * Replicates the INPUT_SCHEMA with JavaScript types for quick reference
 * and IDE type check integration.
 *
 * @typedef {Object} Input
 * @property {Object[]} startUrls
 * @property {boolean} useRequestQueue
 * @property {Object[]} pseudoUrls
 * @property {string} linkSelector
 * @property {boolean} keepUrlFragments
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
    constructor(input) {
        this.name = 'Cheerio Scraper';
        // Set log level early to prevent missed messages.
        if (input.debugLog) log.setLevel(log.LEVELS.DEBUG);

        // Keep this as string to be immutable.
        this.rawInput = JSON.stringify(input);

        // Attempt to load page function from disk if not present on input.
        tools.maybeLoadPageFunctionFromDisk(input, __dirname);

        // Validate INPUT if not running on Apify Cloud Platform.
        if (!Apify.isAtHome()) tools.checkInputOrThrow(input, SCHEMA);

        /**
         * @type {Input}
         */
        this.input = input;
        this.env = Apify.getEnv();

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
        this.input.initialCookies.forEach((cookie) => {
            if (!tools.isPlainObject(cookie)) throw new Error('The initialCookies Array must only contain Objects.');
        });

        // Functions need to be evaluated.
        this.evaledPageFunction = tools.evalFunctionOrThrow(this.input.pageFunction);

        // Used to store data that persist navigations
        this.globalStore = new Map();

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
        const startUrls = this.input.startUrls.map((req) => {
            req.useExtendedUniqueKey = true;
            req.keepUrlFragment = this.input.keepUrlFragments;
            return req;
        });
        this.requestList = await Apify.openRequestList('CHEERIO_SCRAPER', startUrls);

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
     * Resolves to a `CheerioCrawler` instance.
     * @returns {Promise<CheerioCrawler>}
     */
    async createCrawler() {
        await this.initPromise;

        const options = {
            ...this.input.proxyConfiguration,
            handlePageFunction: this._handlePageFunction.bind(this),
            requestList: this.requestList,
            requestQueue: this.requestQueue,
            handlePageTimeoutSecs: this.input.pageFunctionTimeoutSecs,
            prepareRequestFunction: this._prepareRequestFunction.bind(this),
            requestTimeoutSecs: this.input.pageLoadTimeoutSecs,
            ignoreSslErrors: this.input.ignoreSslErrors,
            handleFailedRequestFunction: this._handleFailedRequestFunction.bind(this),
            maxRequestRetries: this.input.maxRequestRetries,
            maxRequestsPerCrawl: this.input.maxPagesPerCrawl,
            autoscaledPoolOptions: {
                maxConcurrency: this.input.maxConcurrency,
                systemStatusOptions: {
                    // Cheerio does a lot of sync operations, so we need to
                    // give it some time to do its job.
                    maxEventLoopOverloadedRatio: MAX_EVENT_LOOP_OVERLOADED_RATIO,
                },
            },
            requestOptions: {
                jar: this.input.useCookieJar,
            },
        };

        this.crawler = new Apify.CheerioCrawler(options);

        return this.crawler;
    }

    _prepareRequestFunction({ request }) {
        // Normalize headers
        request.headers = Object
            .entries(request.headers)
            .reduce((newHeaders, [key, value]) => {
                newHeaders[key.toLowerCase()] = value;
                return newHeaders;
            }, {});

        // Add initial cookies, if any.
        if (this.input.initialCookies.length) {
            const cookieHeaderValue = this.input.initialCookies
                .map(({ name, value }) => `${name}=${value}`)
                .join('; ');
            Object.assign(request.headers, {
                cookie: cookieHeaderValue,
            });
        }
        return request;
    }

    _handleFailedRequestFunction({ request }) {
        const lastError = request.errorMessages[request.errorMessages.length - 1];
        const errorMessage = lastError ? lastError.split('\n')[0] : 'no error';
        log.error(`Request ${request.url} failed and will not be retried anymore. Marking as failed.\nLast Error Message: ${errorMessage}`);
        return this._handleResult(request, {}, null, true);
    }

    /**
     * First of all, it initializes the state that is exposed to the user via
     * `pageFunction` context.
     *
     * Then it invokes the user provided `pageFunction` with the prescribed context
     * and saves its return value.
     *
     * Finally, it makes decisions based on the current state and post-processes
     * the data returned from the `pageFunction`.
     * @param {Object} environment
     * @returns {Function}
     */
    async _handlePageFunction({ request, response, $, html, autoscaledPool }) {
        /**
         * PRE-PROCESSING
         */
        // Make sure that an object containing internal metadata
        // is present on every request.
        tools.ensureMetaData(request);

        // Abort the crawler if the maximum number of results was reached.
        const aborted = await this._handleMaxResultsPerCrawl();
        if (aborted) return;

        // Setup and create Context.
        const contextOptions = {
            crawlerSetup: Object.assign(
                _.pick(this, ['rawInput', 'env', 'globalStore', 'requestQueue']),
                _.pick(this.input, ['customData', 'useRequestQueue']),
            ),
            pageFunctionArguments: {
                $,
                html,
                autoscaledPool,
                request,
                response: {
                    status: response.statusCode,
                    headers: response.headers,
                },
            },
        };
        const { context, state } = createContext(contextOptions);

        /**
         * USER FUNCTION INVOCATION
         */
        const pageFunctionResult = await this.evaledPageFunction(context);

        /**
         * POST-PROCESSING
         */
        // Enqueue more links if Pseudo URLs and a link selector are available,
        // unless the user invoked the `skipLinks()` context function
        // or maxCrawlingDepth would be exceeded.
        if (!state.skipLinks) await this._handleLinks($, request);

        // Save the `pageFunction`s result to the default dataset.
        await this._handleResult(request, response, pageFunctionResult);
    }

    async _handleMaxResultsPerCrawl(autoscaledPool) {
        if (!this.input.maxResultsPerCrawl || this.pagesOutputted < this.input.maxResultsPerCrawl) return false;
        log.info(`User set limit of ${this.input.maxResultsPerCrawl} results was reached. Finishing the crawl.`);
        await autoscaledPool.abort();
        return true;
    }

    async _handleLinks($, request) {
        if (!(this.input.linkSelector && this.requestQueue)) return;
        const currentDepth = request.userData[META_KEY].depth;
        const hasReachedMaxDepth = this.input.maxCrawlingDepth && currentDepth >= this.input.maxCrawlingDepth;
        if (hasReachedMaxDepth) {
            log.debug(`Request ${request.url} reached the maximum crawling depth of ${currentDepth}.`);
            return;
        }

        await Apify.utils.enqueueLinks({
            $,
            selector: this.input.linkSelector,
            pseudoUrls: this.input.pseudoUrls,
            requestQueue: this.requestQueue,
            baseUrl: request.loadedUrl,
            transformRequestFunction: (requestOptions) => {
                requestOptions.userData = {
                    [META_KEY]: {
                        parentRequestId: request.id || request.uniqueKey,
                        depth: currentDepth + 1,
                    },
                };
                requestOptions.useExtendedUniqueKey = true;
                requestOptions.keepUrlFragment = this.input.keepUrlFragments;
                return requestOptions;
            },
        });
    }

    async _handleResult(request, response, pageFunctionResult, isError) {
        const payload = tools.createDatasetPayload(request, response, pageFunctionResult, isError);
        await Apify.pushData(payload);
        this.pagesOutputted++;
    }
}

module.exports = CrawlerSetup;
