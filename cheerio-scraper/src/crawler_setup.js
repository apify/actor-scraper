const Apify = require('apify');
const cheerio = require('cheerio');
const {
    tools,
    createContext,
    constants: { META_KEY, SESSION_MAX_USAGE_COUNTS, PROXY_ROTATION_NAMES },
} = require('@apify/scraper-tools');

const SCHEMA = require('../INPUT_SCHEMA.json');

const { utils: { log } } = Apify;

const MAX_EVENT_LOOP_OVERLOADED_RATIO = 0.9;
const SESSION_STORE_NAME = 'APIFY-CHEERIO-SCRAPER-SESSION-STORE';

/**
 * Replicates the INPUT_SCHEMA with JavaScript types for quick reference
 * and IDE type check integration.
 *
 * @typedef {Object} Input
 * @property {Object[]} startUrls
 * @property {Object[]} pseudoUrls
 * @property {string} linkSelector
 * @property {boolean} keepUrlFragments
 * @property {string} pageFunction
 * @property {string} preNavigationHooks
 * @property {string} postNavigationHooks
 * @property {string} prepareRequestFunction
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
 * @property {string} proxyRotation
 * @property {string} sessionPoolName
 * @property {string} suggestResponseEncoding
 * @property {boolean} forceResponseEncoding
 * @property {string} datasetName
 * @property {string} keyValueStoreName
 * @property {string} requestQueueName
 */

/**
 * Holds all the information necessary for constructing a crawler
 * instance and creating a context for a pageFunction invocation.
 */
class CrawlerSetup {
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
        this.input.pseudoUrls.forEach((purl) => {
            if (!tools.isPlainObject(purl)) throw new Error('The pseudoUrls Array must only contain Objects.');
            if (purl.userData && !tools.isPlainObject(purl.userData)) throw new Error('The userData property of a pseudoUrl must be an Object.');
        });
        this.input.initialCookies.forEach((cookie) => {
            if (!tools.isPlainObject(cookie)) throw new Error('The initialCookies Array must only contain Objects.');
        });

        // solving proxy rotation settings
        this.maxSessionUsageCount = SESSION_MAX_USAGE_COUNTS[this.input.proxyRotation];

        // Functions need to be evaluated.
        this.evaledPageFunction = tools.evalFunctionOrThrow(this.input.pageFunction);

        if (this.input.prepareRequestFunction) {
            this.evaledPrepareRequestFunction = tools.evalFunctionOrThrow(this.input.prepareRequestFunction);
            log.deprecated('`prepareRequestFunction` is deprecated, use `pre/postNavigationHooks` instead');
        }

        if (this.input.preNavigationHooks) {
            this.evaledPreNavigationHooks = tools.evalFunctionArrayOrThrow(this.input.preNavigationHooks, 'preNavigationHooks');
        } else {
            this.evaledPreNavigationHooks = [];
        }

        if (this.input.postNavigationHooks) {
            this.evaledPostNavigationHooks = tools.evalFunctionArrayOrThrow(this.input.postNavigationHooks, 'postNavigationHooks');
        } else {
            this.evaledPostNavigationHooks = [];
        }

        // Used to store data that persist navigations
        this.globalStore = new Map();

        // Named storages
        this.datasetName = this.input.datasetName;
        this.keyValueStoreName = this.input.keyValueStoreName;
        this.requestQueueName = this.input.requestQueueName;

        // Initialize async operations.
        this.crawler = null;
        this.requestList = null;
        this.requestQueue = null;
        this.dataset = null;
        this.keyValueStore = null;
        this.proxyConfiguration = null;
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

        // RequestQueue
        this.requestQueue = await Apify.openRequestQueue(this.requestQueueName);

        // Dataset
        this.dataset = await Apify.openDataset(this.datasetName);
        const { itemsCount } = await this.dataset.getInfo();
        this.pagesOutputted = itemsCount || 0;

        // KeyValueStore
        this.keyValueStore = await Apify.openKeyValueStore(this.keyValueStoreName);

        // Proxy configuration
        this.proxyConfiguration = await Apify.createProxyConfiguration(this.input.proxyConfiguration);
    }

    /**
     * Resolves to a `CheerioCrawler` instance.
     * @returns {Promise<CheerioCrawler>}
     */
    async createCrawler() {
        await this.initPromise;

        const options = {
            proxyConfiguration: this.proxyConfiguration,
            handlePageFunction: this._handlePageFunction.bind(this),
            preNavigationHooks: this._runHookWithEnhancedContext(this.evaledPreNavigationHooks),
            postNavigationHooks: this._runHookWithEnhancedContext(this.evaledPostNavigationHooks),
            requestList: this.requestList,
            requestQueue: this.requestQueue,
            handlePageTimeoutSecs: this.input.pageFunctionTimeoutSecs,
            prepareRequestFunction: this._prepareRequestFunction.bind(this),
            requestTimeoutSecs: this.input.pageLoadTimeoutSecs,
            ignoreSslErrors: this.input.ignoreSslErrors,
            handleFailedRequestFunction: this._handleFailedRequestFunction.bind(this),
            maxRequestRetries: this.input.maxRequestRetries,
            maxRequestsPerCrawl: this.input.maxPagesPerCrawl,
            additionalMimeTypes: this.input.additionalMimeTypes,
            autoscaledPoolOptions: {
                maxConcurrency: this.input.maxConcurrency,
                systemStatusOptions: {
                    // Cheerio does a lot of sync operations, so we need to
                    // give it some time to do its job.
                    maxEventLoopOverloadedRatio: MAX_EVENT_LOOP_OVERLOADED_RATIO,
                },
            },
            useSessionPool: true,
            persistCookiesPerSession: true,
            sessionPoolOptions: {
                persistStateKeyValueStoreId: this.input.sessionPoolName ? SESSION_STORE_NAME : undefined,
                persistStateKey: this.input.sessionPoolName,
                sessionOptions: {
                    maxUsageCount: this.maxSessionUsageCount,
                },
            },
        };

        if (this.input.proxyRotation === PROXY_ROTATION_NAMES.UNTIL_FAILURE) {
            options.sessionPoolOptions.maxPoolSize = 1;
        }

        if (this.input.suggestResponseEncoding) {
            if (this.input.forceResponseEncoding) {
                options.forceResponseEncoding = this.input.suggestResponseEncoding;
            } else {
                options.suggestResponseEncoding = this.input.suggestResponseEncoding;
            }
        }

        this.crawler = new Apify.CheerioCrawler(options);

        return this.crawler;
    }

    async _prepareRequestFunction({ request, session, proxyInfo }) {
        // Normalize headers
        request.headers = Object
            .entries(request.headers)
            .reduce((newHeaders, [key, value]) => {
                newHeaders[key.toLowerCase()] = value;
                return newHeaders;
            }, {});

        // Add initial cookies, if any.
        if (this.input.initialCookies && this.input.initialCookies.length) {
            const cookiesToSet = tools.getMissingCookiesFromSession(session, this.input.initialCookies, request.url);
            if (cookiesToSet && cookiesToSet.length) {
                // setting initial cookies that are not already in the session and page
                session.setPuppeteerCookies(cookiesToSet, request.url);
            }
        }

        if (this.evaledPrepareRequestFunction) {
            try {
                const { customData } = this.input;
                await this.evaledPrepareRequestFunction({ request, session, proxyInfo, Apify, customData });
            } catch (err) {
                log.error('User provided Prepare request function failed.');
                throw err;
            }
        }
        return request;
    }

    _runHookWithEnhancedContext(hooks) {
        return hooks.map((hook) => (ctx, ...args) => {
            const { customData } = this.input;
            return hook({ ...ctx, Apify, customData }, ...args);
        });
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
     * @param {Object} crawlingContext
     * @returns {Function}
     */
    async _handlePageFunction(crawlingContext) {
        const { request, response, $ } = crawlingContext;
        const pageFunctionArguments = {};

        // We must use properties and descriptors not to trigger getters / setters.
        const props = Object.getOwnPropertyDescriptors(crawlingContext);
        ['json', 'body'].forEach((key) => {
            props[key].configurable = true;
        });
        Object.defineProperties(pageFunctionArguments, props);

        pageFunctionArguments.cheerio = cheerio;
        pageFunctionArguments.response = {
            status: response.statusCode,
            headers: response.headers,
        };

        Object.defineProperties(this, Object.getOwnPropertyDescriptors(pageFunctionArguments));

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
            crawlerSetup: {
                rawInput: this.rawInput,
                env: this.env,
                globalStore: this.globalStore,
                requestQueue: this.requestQueue,
                keyValueStore: this.keyValueStore,
                customData: this.input.customData,
            },
            pageFunctionArguments,
        };
        const { context, state } = createContext(contextOptions);

        /**
         * USER FUNCTION INVOCATION
         */
        const pageFunctionResult = await this.evaledPageFunction(context);

        /**
         * POST-PROCESSING
         */
        // Enqueue more links if Pseudo URLs, a link selector and cheerio instance are available,
        // unless the user invoked the `skipLinks()` context function
        // or maxCrawlingDepth would be exceeded.
        if (!state.skipLinks && $) await this._handleLinks($, request);

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
        await this.dataset.pushData(payload);
        this.pagesOutputted++;
    }
}

module.exports = CrawlerSetup;
