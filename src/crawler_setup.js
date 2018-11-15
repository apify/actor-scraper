/* eslint-disable class-methods-use-this */
const path = require('path');
const Apify = require('apify');
const _ = require('underscore');
const tools = require('./tools');
const { META_KEY } = require('./consts');

const { utils: { log, puppeteer } } = Apify;

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
 * @property {number} minConcurrency
 * @property {number} maxConcurrency
 * @property {number} pageLoadTimeoutSecs
 * @property {Object} customData
 */

/**
 * Holds all the information necessary for constructing a crawler
 * instance and creating a context for a pageFunction invocation.
 */
class CrawlerSetup {
    constructor(input, environment) {
        // Validate INPUT if not running on Apify Cloud Platform.
        if (!Apify.isAtHome()) tools.checkInputOrThrow(input);

        // Keep this as string to be immutable.
        this.rawInput = JSON.stringify(input);

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

        // Used to store page specific data.
        this.pageContexts = new WeakMap();

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
        this.requestList = new Apify.RequestList({ sources: this.input.startUrls });
        await this.requestList.initialize();

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
     * Resolves to an options object that may be directly passed to a `PuppeteerCrawler`
     * constructor.
     * @returns {Promise<PuppeteerCrawler>}
     */
    async createCrawler() {
        await this.initPromise;

        const options = {
            handlePageFunction: this._handlePageFunction.bind(this),
            requestList: this.requestList,
            requestQueue: this.requestQueue,
            // handlePageTimeoutSecs: use default,
            gotoFunction: this._gotoFunction.bind(this),
            handleFailedRequestFunction: this._handleFailedRequestFunction.bind(this),
            // maxRequestRetries: use default,
            maxRequestsPerCrawl: this.input.maxPagesPerCrawl,
            // maxOpenPagesPerInstance: use default,
            // retireInstanceAfterRequestCount: use default,
            // instanceKillerIntervalMillis: use default,
            // killInstanceAfterMillis: use default,
            proxyUrls: this.input.proxyConfiguration.proxyUrls,
            // launchPuppeteerFunction: use default,
            launchPuppeteerOptions: {
                ...(_.omit(this.input.proxyConfiguration, 'proxyUrls')),
                ignoreHTTPSErrors: this.input.ignoreSslErrors,
                args: ['--enable-resource-load-scheduler=false'],
            },
        };

        this.crawler = new Apify.PuppeteerCrawler(options);

        return this.crawler;
    }

    async _gotoFunction({ request, page }) {
        // Attach a console listener to get all logs as soon as possible.
        tools.dumpConsole(page);

        // Create a new page context.
        const pageContext = {};
        this.pageContexts.set(page, pageContext);

        // Invoke navigation.
        const response = await page.goto(request.url, { timeout: this.input.pageLoadTimeoutSecs * 1000 });

        // Add Apify namespace to Browser context
        const browserNamespace = 'Apify'; // TODO make this random
        await page.evaluate((namespace) => { window[namespace] = {}; }, browserNamespace);

        // Attach function handles to the page (they survive navigation).
        pageContext.browserHandles = {
            log: await tools.createBrowserHandlesForObject(page, log, ['info', 'debug']),
            requestList: await tools.createBrowserHandlesForObject(page, this.requestList, ['getState', 'isEmpty', 'isFinished']),
            dataset: await tools.createBrowserHandlesForObject(page, this.dataset, ['pushData']),
            keyValueStore: await tools.createBrowserHandlesForObject(page, this.keyValueStore, ['getValue', 'setValue']),
        };
        if (this.requestQueue) {
            pageContext.browserHandles.requestQueue = await tools.createBrowserHandlesForObject(page, this.requestQueue, ['isEmpty', 'isFinished']);
        }

        // Inject Context class into the Browser, to be able to
        // construct a context instance later.
        await puppeteer.injectFile(page, path.join(__dirname, 'context.browser.js'));
        await puppeteer.injectFile(page, path.join(__dirname, 'node_proxy.browser.js'));

        await page.evaluate(tools.wrapPageFunction(browserNamespace, this.input.pageFunction));
        return response;
    }

    _handleFailedRequestFunction({ request }) { // eslint-disable-line class-methods-use-this
        log.error(`Request ${request.id} failed ${this.input.maxRequestRetries + 1} times. Marking as failed.`);
        return this._handleResult(request, null, true);
    }

    /**
     * Factory that creates a `handlePageFunction` to be used in the `PuppeteerCrawler`
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
    async _handlePageFunction({ request, response, page, puppeteerPool }) {
        /**
         * PRE-PROCESSING
         */
        // Make sure that an object containing internal metadata
        // is present on every request.
        tools.ensureMetaData(request);

        // Abort the crawler if the maximum number of results was reached.
        const aborted = await this._handleMaxResultsPerCrawl();
        if (aborted) return;

        // Setup Context and pass the configuration down to Browser.
        const contextOptions = {
            crawlerSetup: Object.assign(_.pick(this, ['rawInput', 'env']), _.pick(this.input, ['customData', 'useRequestQueue'])),
            browserHandles: this.pageContexts.get(page).browserHandles,
        };

        /**
         * USER FUNCTION INVOCATION
         */
        const { pageFunctionResult, state } = await page.evaluate(async (ctxOpts) => {
            /* eslint-disable no-shadow */
            const { context, state } = window.Apify.createContext(ctxOpts);
            const pageFunctionResult = await window.Apify.pageFunction(context);
            return {
                pageFunctionResult,
                state,
            };
        }, contextOptions);

        /**
         * POST-PROCESSING
         */

        // Enqueue more links if Pseudo URLs and a clickable selector are available,
        // unless the user invoked the `skipLinks()` context function
        // or maxCrawlingDepth would be exceeded.
        await this._handleLinks(page, state, request);

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

    async _handleLinks(page, state, request) {
        const currentDepth = request.userData[META_KEY].depth;
        const hasReachedMaxDepth = this.input.maxCrawlingDepth && currentDepth >= this.input.maxCrawlingDepth;
        if (hasReachedMaxDepth) {
            log.debug(`Request ${request.id} reached the maximum crawling depth of ${currentDepth}.`);
            return;
        }
        const canEnqueue = !state.skipLinks && this.input.pseudoUrls.length && this.input.linkSelector;
        if (canEnqueue) await tools.enqueueLinks(page, this.input.linkSelector, this.input.pseudoUrls, this.requestQueue, request);
    }

    async _handleResult(request, pageFunctionResult) {
        const payload = tools.createDatasetPayload(request, pageFunctionResult);
        await Apify.pushData(payload);
        this.pagesOutputted++;
    }
}

module.exports = CrawlerSetup;
