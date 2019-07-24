const Apify = require('apify');
const _ = require('underscore');
const {
    tools,
    browserTools,
    createContext,
    constants: { META_KEY, DEFAULT_VIEWPORT, DEVTOOLS_TIMEOUT_SECS },
} = require('@apify/scraper-tools');

const SCHEMA = require('../INPUT_SCHEMA');

const { utils: { log, puppeteer } } = Apify;

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
 * @property {boolean} browserLog
 * @property {boolean} downloadMedia
 * @property {boolean} downloadCss
 * @property {number} maxRequestRetries
 * @property {number} maxPagesPerCrawl
 * @property {number} maxResultsPerCrawl
 * @property {number} maxCrawlingDepth
 * @property {number} maxConcurrency
 * @property {number} pageLoadTimeoutSecs
 * @property {number} pageFunctionTimeoutSecs
 * @property {Object} customData
 * @property {Array} initialCookies
 * @property {Array} waitUntil
 * @property {boolean} useChrome
 * @property {boolean} useStealth
 * @property {boolean} ignoreSslErrors
 * @property {boolean} ignoreCorsAndCsp
 * @property {string} preGotoFunction
 * @property {string} clickableElementsSelector
 */

/**
 * Holds all the information necessary for constructing a crawler
 * instance and creating a context for a pageFunction invocation.
 */
class CrawlerSetup {
    /* eslint-disable class-methods-use-this */
    constructor(input) {
        this.name = 'Puppeteer Scraper';
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
        this.input.waitUntil.forEach((event) => {
            if (!/^(domcontentloaded|load|networkidle2|networkidle0)$/.test(event)) {
                throw new Error('Navigation wait until events must be valid. See tooltip.');
            }
        });

        // Functions need to be evaluated.
        this.evaledPageFunction = tools.evalFunctionOrThrow(this.input.pageFunction);
        if (this.input.preGotoFunction) {
            this.evaledPreGotoFunction = tools.evalFunctionOrThrow(this.input.preGotoFunction);
        }

        // Used to store data that persist navigations
        this.globalStore = new Map();

        // Excluded resources
        this.blockedUrlPatterns = [];
        if (!this.input.downloadMedia) {
            this.blockedUrlPatterns = [...this.blockedUrlPatterns,
                '.jpg', '.jpeg', '.png', '.svg', '.gif', '.webp', '.webm', '.ico', '.woff', '.eot',
            ];
        }
        if (!this.input.downloadCss) this.blockedUrlPatterns.push('.css');

        // Start Chromium with Debugger any time the page function includes the keyword.
        this.devtools = this.input.pageFunction.includes('debugger;');

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
        this.requestList = await Apify.openRequestList('PUPPETEER_SCRAPER', startUrls);

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
     * Resolves to a `PuppeteerCrawler` instance.
     * @returns {Promise<PuppeteerCrawler>}
     */
    async createCrawler() {
        await this.initPromise;

        const args = [];
        if (this.input.ignoreCorsAndCsp) args.push('--disable-web-security');

        const options = {
            handlePageFunction: this._handlePageFunction.bind(this),
            requestList: this.requestList,
            requestQueue: this.requestQueue,
            handlePageTimeoutSecs: this.devtools ? DEVTOOLS_TIMEOUT_SECS : this.input.pageFunctionTimeoutSecs,
            gotoFunction: this._gotoFunction.bind(this),
            handleFailedRequestFunction: this._handleFailedRequestFunction.bind(this),
            maxConcurrency: this.input.maxConcurrency,
            maxRequestRetries: this.input.maxRequestRetries,
            maxRequestsPerCrawl: this.input.maxPagesPerCrawl,
            proxyUrls: this.input.proxyConfiguration.proxyUrls,
            // launchPuppeteerFunction: use default,
            puppeteerPoolOptions: {
                useLiveView: true,
                recycleDiskCache: true,
            },
            launchPuppeteerOptions: {
                ...(_.omit(this.input.proxyConfiguration, 'proxyUrls')),
                ignoreHTTPSErrors: this.input.ignoreSslErrors,
                defaultViewport: DEFAULT_VIEWPORT,
                devtools: this.devtools,
                useChrome: this.input.useChrome,
                stealth: this.input.useStealth,
                args,
            },
        };

        this.crawler = new Apify.PuppeteerCrawler(options);

        return this.crawler;
    }

    async _gotoFunction({ request, page }) {
        // Attach a console listener to get all logs from Browser context.
        if (this.input.browserLog) browserTools.dumpConsole(page);

        // Prevent download of stylesheets and media, unless selected otherwise
        if (this.blockedUrlPatterns.length) {
            await puppeteer.blockRequests(page, {
                urlPatterns: this.blockedUrlPatterns,
            });
        }

        // Add initial cookies, if any.
        if (this.input.initialCookies.length) await page.setCookie(...this.input.initialCookies);

        // Disable content security policy.
        if (this.input.ignoreCorsAndCsp) await page.setBypassCSP(true);

        // Enable pre-processing before navigation is initiated.
        if (this.evaledPreGotoFunction) {
            try {
                await this.evaledPreGotoFunction({ request, page, Apify });
            } catch (err) {
                log.error('User provided Pre goto function failed.');
                throw err;
            }
        }

        // Invoke navigation.
        return puppeteer.gotoExtended(page, request, {
            timeout: (this.devtools ? DEVTOOLS_TIMEOUT_SECS : this.input.pageLoadTimeoutSecs) * 1000,
            waitUntil: this.input.waitUntil,
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
     * @param {Object} environment
     * @returns {Function}
     */
    async _handlePageFunction({ request, response, page, puppeteerPool, autoscaledPool }) {
        /**
         * PRE-PROCESSING
         */
        // Make sure that an object containing internal metadata
        // is present on every request.
        tools.ensureMetaData(request);

        // Abort the crawler if the maximum number of results was reached.
        const aborted = await this._handleMaxResultsPerCrawl(autoscaledPool);
        if (aborted) return;

        // Setup and create Context.
        const contextOptions = {
            crawlerSetup: Object.assign(
                _.pick(this, ['rawInput', 'env', 'globalStore', 'requestQueue']),
                _.pick(this.input, ['customData', 'useRequestQueue']),
            ),
            pageFunctionArguments: {
                page,
                autoscaledPool,
                puppeteerPool,
                request,
                response: {
                    status: response && response.status(),
                    headers: response && response.headers(),
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
        if (!state.skipLinks) await this._handleLinks(page, request);

        // Save the `pageFunction`s result to the default dataset.
        await this._handleResult(request, response, pageFunctionResult);
    }

    async _handleMaxResultsPerCrawl(autoscaledPool) {
        if (!this.input.maxResultsPerCrawl || this.pagesOutputted < this.input.maxResultsPerCrawl) return false;
        log.info(`User set limit of ${this.input.maxResultsPerCrawl} results was reached. Finishing the crawl.`);
        await autoscaledPool.abort();
        return true;
    }

    async _handleLinks(page, request) {
        if (!this.requestQueue) return;
        const currentDepth = request.userData[META_KEY].depth;
        const hasReachedMaxDepth = this.input.maxCrawlingDepth && currentDepth >= this.input.maxCrawlingDepth;
        if (hasReachedMaxDepth) {
            log.debug(`Request ${request.url} reached the maximum crawling depth of ${currentDepth}.`);
            return;
        }

        const enqueueOptions = {
            page,
            selector: null,
            pseudoUrls: this.input.pseudoUrls,
            requestQueue: this.requestQueue,
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
        };

        if (this.input.linkSelector) {
            await Apify.utils.enqueueLinks({ ...enqueueOptions, ...{ selector: this.input.linkSelector } });
        }
        if (this.input.clickableElementsSelector) {
            await Apify.utils.puppeteer.enqueueLinksByClickingElements({ ...enqueueOptions, ...{ selector: this.input.clickableElementsSelector } });
        }
    }

    async _handleResult(request, response, pageFunctionResult, isError) {
        const payload = tools.createDatasetPayload(request, response, pageFunctionResult, isError);
        await Apify.pushData(payload);
        this.pagesOutputted++;
    }
}

module.exports = CrawlerSetup;
