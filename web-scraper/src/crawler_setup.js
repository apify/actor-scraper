const Apify = require('apify');
const { URL } = require('url');
const contentType = require('content-type');
const {
    tools,
    browserTools,
    constants: { META_KEY, DEFAULT_VIEWPORT, DEVTOOLS_TIMEOUT_SECS, PROXY_ROTATION_NAMES, SESSION_MAX_USAGE_COUNTS },
} = require('@apify/scraper-tools');
const DevToolsServer = require('devtools-server');

const { CHROME_DEBUGGER_PORT } = require('./consts');
const createBundle = require('./bundle.browser');
const SCHEMA = require('../INPUT_SCHEMA.json');
const GlobalStore = require('./global_store');

const SESSION_STORE_NAME = 'APIFY-WEB-SCRAPER-SESSION-STORE';
const RUN_MODES = {
    PRODUCTION: 'PRODUCTION',
    DEVELOPMENT: 'DEVELOPMENT',
};
const BREAKPOINT_LOCATIONS = {
    NONE: 'NONE',
    BEFORE_GOTO: 'BEFORE_GOTO',
    BEFORE_PAGE_FUNCTION: 'BEFORE_PAGE_FUNCTION',
    AFTER_PAGE_FUNCTION: 'AFTER_PAGE_FUNCTION',
};
const MAX_CONCURRENCY_IN_DEVELOPMENT = 1;

const { utils: { log, puppeteer } } = Apify;

/**
 * Replicates the INPUT_SCHEMA with JavaScript types for quick reference
 * and IDE type check integration.
 *
 * @typedef {Object} Input
 * @property {string} runMode
 * @property {Object[]} startUrls
 * @property {Object[]} pseudoUrls
 * @property {string} linkSelector
 * @property {boolean} keepUrlFragments
 * @property {string} pageFunction
 * @property {string} preNavigationHooks
 * @property {string} postNavigationHooks
 * @property {Object} proxyConfiguration
 * @property {boolean} debugLog
 * @property {boolean} browserLog
 * @property {boolean} injectJQuery
 * @property {boolean} injectUnderscore
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
 * @property {boolean} ignoreCorsAndCsp
 * @property {boolean} ignoreSslErrors
 * @property {string} proxyRotation
 * @property {string} sessionPoolName
 * @property {string} breakpointLocation
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
        this.name = 'Web Scraper';
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
        this.input.waitUntil.forEach((event) => {
            if (!/^(domcontentloaded|load|networkidle2|networkidle0)$/.test(event)) {
                throw new Error('Navigation wait until events must be valid. See tooltip.');
            }
        });
        // solving proxy rotation settings
        this.maxSessionUsageCount = SESSION_MAX_USAGE_COUNTS[this.input.proxyRotation];

        tools.evalFunctionOrThrow(this.input.pageFunction);

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

        // Used to store page specific data.
        this.pageContexts = new WeakMap();

        // Used to store data that persist navigations
        this.globalStore = new GlobalStore();

        // Excluded resources
        this.blockedUrlPatterns = [];
        if (!this.input.downloadMedia) {
            this.blockedUrlPatterns = [...this.blockedUrlPatterns,
                '.jpg', '.jpeg', '.png', '.svg', '.gif', '.webp', '.webm', '.ico', '.woff', '.eot',
            ];
        }
        if (!this.input.downloadCss) this.blockedUrlPatterns.push('.css');

        this.isDevRun = this.input.runMode === RUN_MODES.DEVELOPMENT;

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
        this.initPromise = this._initializeAsync();
    }

    async _initializeAsync() {
        // RequestList
        const startUrls = this.input.startUrls.map((req) => {
            req.useExtendedUniqueKey = true;
            req.keepUrlFragment = this.input.keepUrlFragments;
            return req;
        });
        this.requestList = await Apify.openRequestList('WEB_SCRAPER', startUrls);

        // RequestQueue
        this.requestQueue = await Apify.openRequestQueue(this.requestQueueName);

        // Dataset
        this.dataset = await Apify.openDataset(this.datasetName);
        const { itemsCount } = await this.dataset.getInfo();
        this.pagesOutputted = itemsCount || 0;

        // KeyValueStore
        this.keyValueStore = await Apify.openKeyValueStore(this.keyValueStoreName);
    }

    /**
     * Resolves to a `PuppeteerCrawler` instance.
     * constructor.
     * @returns {Promise<PuppeteerCrawler>}
     */
    async createCrawler() {
        await this.initPromise;

        const args = [];
        if (this.input.ignoreCorsAndCsp) args.push('--disable-web-security');
        if (this.isDevRun) args.push(`--remote-debugging-port=${CHROME_DEBUGGER_PORT}`);

        const options = {
            handlePageFunction: this._handlePageFunction.bind(this),
            requestList: this.requestList,
            requestQueue: this.requestQueue,
            handlePageTimeoutSecs: this.isDevRun ? DEVTOOLS_TIMEOUT_SECS : this.input.pageFunctionTimeoutSecs,
            preNavigationHooks: [],
            postNavigationHooks: [],
            handleFailedRequestFunction: this._handleFailedRequestFunction.bind(this),
            maxConcurrency: this.isDevRun ? MAX_CONCURRENCY_IN_DEVELOPMENT : this.input.maxConcurrency,
            maxRequestRetries: this.input.maxRequestRetries,
            maxRequestsPerCrawl: this.input.maxPagesPerCrawl,
            proxyConfiguration: await Apify.createProxyConfiguration(this.input.proxyConfiguration),
            browserPoolOptions: {
                preLaunchHooks: [
                    async () => {
                        if (!this.isDevRun) {
                            return;
                        }

                        const devToolsServer = new DevToolsServer({
                            containerHost: new URL(process.env.APIFY_CONTAINER_URL).host,
                            devToolsServerPort: process.env.APIFY_CONTAINER_PORT,
                            chromeRemoteDebuggingPort: CHROME_DEBUGGER_PORT,
                        });
                        await devToolsServer.start();
                    },
                ],
            },
            launchContext: {
                useChrome: this.input.useChrome,
                stealth: this.input.useStealth,
                launchOptions: {
                    ignoreHTTPSErrors: this.input.ignoreSslErrors,
                    defaultViewport: DEFAULT_VIEWPORT,
                    args,
                },
            },
            useSessionPool: !this.isDevRun,
            persistCookiesPerSession: !this.isDevRun,
            sessionPoolOptions: {
                persistStateKeyValueStoreId: this.input.sessionPoolName ? SESSION_STORE_NAME : undefined,
                persistStateKey: this.input.sessionPoolName,
                sessionOptions: {
                    maxUsageCount: this.maxSessionUsageCount,
                },
            },
        };

        this._createNavigationHooks(options);

        if (this.input.proxyRotation === PROXY_ROTATION_NAMES.UNTIL_FAILURE) {
            options.sessionPoolOptions.maxPoolSize = 1;
        }
        if (this.isDevRun) {
            options.browserPoolOptions.retireBrowserAfterPageCount = Infinity;
        }

        this.crawler = new Apify.PuppeteerCrawler(options);

        if (this.isDevRun) logDevRunWarning();
        return this.crawler;
    }

    /**
     * @private
     */
    _createNavigationHooks(options) {
        options.preNavigationHooks.push(async ({ request, page, session }, gotoOptions) => {
            const start = process.hrtime();

            // Create a new page context with a new random key for Apify namespace.
            const pageContext = {
                apifyNamespace: await tools.createRandomHash(),
                skipLinks: false,
                timers: { start },
            };
            this.pageContexts.set(page, pageContext);

            // Attach a console listener to get all logs as soon as possible.
            if (this.input.browserLog) browserTools.dumpConsole(page);

            // Prevent download of stylesheets and media, unless selected otherwise
            if (this.blockedUrlPatterns.length) {
                await puppeteer.blockRequests(page, {
                    urlPatterns: this.blockedUrlPatterns,
                });
            }

            // Add initial cookies, if any.
            if (this.input.initialCookies && this.input.initialCookies.length) {
                const cookiesToSet = session
                    ? tools.getMissingCookiesFromSession(session, this.input.initialCookies, request.url)
                    : this.input.initialCookies;
                if (cookiesToSet && cookiesToSet.length) {
                    // setting initial cookies that are not already in the session and page
                    // TODO: We can remove the condition when there is an option to define blocked status codes in sessionPool
                    if (session) session.setPuppeteerCookies(cookiesToSet, request.url);
                    await page.setCookie(...cookiesToSet);
                }
            }

            // Disable content security policy.
            if (this.input.ignoreCorsAndCsp) await page.setBypassCSP(true);

            tools.logPerformance(request, 'gotoFunction INIT', start);
            const handleStart = process.hrtime();
            pageContext.browserHandles = await this._injectBrowserHandles(page, pageContext);
            tools.logPerformance(request, 'gotoFunction INJECTION HANDLES', handleStart);

            const evalStart = process.hrtime();
            await Promise.all([
                page.evaluateOnNewDocument(createBundle, pageContext.apifyNamespace),
                page.evaluateOnNewDocument(browserTools.wrapPageFunction(this.input.pageFunction, pageContext.apifyNamespace)),
            ]);
            tools.logPerformance(request, 'gotoFunction INJECTION EVAL', evalStart);

            if (this.isDevRun) {
                const cdpClient = await page.target().createCDPSession();
                await cdpClient.send('Debugger.enable');
                if (this.input.breakpointLocation === BREAKPOINT_LOCATIONS.BEFORE_GOTO) {
                    await cdpClient.send('Debugger.pause');
                }
            }

            pageContext.timers.navStart = process.hrtime();
            gotoOptions.timeout = this.input.pageLoadTimeoutSecs * 1000;
            gotoOptions.waitUntil = this.input.waitUntil;
        });

        options.preNavigationHooks.push(...this.evaledPreNavigationHooks);
        options.postNavigationHooks.push(...this.evaledPostNavigationHooks);

        options.postNavigationHooks.push(async ({ request, page, response }) => {
            await this._waitForLoadEventWhenXml(page, response);
            const pageContext = this.pageContexts.get(page);
            tools.logPerformance(request, 'gotoFunction NAVIGATION', pageContext.timers.navStart);

            const delayStart = process.hrtime();
            await this._assertNamespace(page, pageContext.apifyNamespace);

            // Inject selected libraries
            if (this.input.injectJQuery) await puppeteer.injectJQuery(page);
            if (this.input.injectUnderscore) await puppeteer.injectUnderscore(page);

            tools.logPerformance(request, 'gotoFunction INJECTION DELAY', delayStart);
            tools.logPerformance(request, 'gotoFunction EXECUTION', pageContext.timers.start);
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
     * @returns {Promise<void>}
     */
    async _handlePageFunction(crawlingContext) {
        const { request, response, page, crawler, proxyInfo } = crawlingContext;
        const start = process.hrtime();
        const pageContext = this.pageContexts.get(page);

        /**
         * PRE-PROCESSING
         */
        // Make sure that an object containing internal metadata
        // is present on every request.
        tools.ensureMetaData(request);

        // Abort the crawler if the maximum number of results was reached.
        const aborted = await this._handleMaxResultsPerCrawl(crawler.autoscaledPool);
        if (aborted) return;

        // Setup Context and pass the configuration down to Browser.
        const contextOptions = {
            crawlerSetup: {
                rawInput: this.rawInput,
                env: this.env,
                customData: this.input.customData,
                injectJQuery: this.input.injectJQuery,
                injectUnderscore: this.input.injectUnderscore,
                META_KEY,
            },
            browserHandles: pageContext.browserHandles,
            pageFunctionArguments: {
                request,
                proxyInfo,
                response: {
                    status: response && response.status(),
                    headers: response && response.headers(),
                },
            },
        };

        /**
         * USER FUNCTION EXECUTION
         */
        tools.logPerformance(request, 'handlePageFunction PREPROCESSING', start);

        if (this.isDevRun && this.input.breakpointLocation === BREAKPOINT_LOCATIONS.BEFORE_PAGE_FUNCTION) {
            await page.evaluate(async () => { debugger; }); // eslint-disable-line no-debugger
        }
        const startUserFn = process.hrtime();

        const namespace = pageContext.apifyNamespace;
        const output = await page.evaluate(async (ctxOpts, namespc) => {
            /* eslint-disable no-shadow */
            const context = window[namespc].createContext(ctxOpts);
            const output = {};
            try {
                output.pageFunctionResult = await window[namespc].pageFunction(context);
            } catch (err) {
                output.pageFunctionError = Object.getOwnPropertyNames(err)
                    .reduce((memo, name) => {
                        memo[name] = err[name];
                        return memo;
                    }, {});
            }
            // This needs to be added after pageFunction has run.
            output.requestFromBrowser = context.request;

            /**
             * Since Dates cannot travel back to Node and Puppeteer does not use .toJSON
             * to stringify, they come back as empty objects. We could use JSON.stringify
             * ourselves, but that exposes us to overridden .toJSON in the target websites.
             * This hack is not ideal, but it avoids both problems.
             */
            function replaceAllDatesInObjectWithISOStrings(obj) {
                for (const [key, value] of Object.entries(obj)) {
                    if (value instanceof Date && typeof value.toISOString === 'function') {
                        obj[key] = value.toISOString();
                    } else if (value && typeof value === 'object') {
                        replaceAllDatesInObjectWithISOStrings(value);
                    }
                }
                return obj;
            }

            return replaceAllDatesInObjectWithISOStrings(output);
        }, contextOptions, namespace);

        tools.logPerformance(request, 'handlePageFunction USER FUNCTION', startUserFn);
        const finishUserFn = process.hrtime();

        /**
         * POST-PROCESSING
         */
        const { pageFunctionResult, requestFromBrowser, pageFunctionError } = output;
        // Merge requestFromBrowser into request to preserve modifications that
        // may have been made in browser context.
        Object.assign(request, requestFromBrowser);

        // Throw error from pageFunction, if any.
        if (pageFunctionError) throw tools.createError(pageFunctionError);

        // Enqueue more links if a link selector is available,
        // unless the user invoked the `skipLinks()` context function
        // or maxCrawlingDepth would be exceeded.
        if (!pageContext.skipLinks) {
            await this._handleLinks(page, request);
        }

        // Save the `pageFunction`s result (or just metadata) to the default dataset.
        await this._handleResult(request, response, pageFunctionResult);

        tools.logPerformance(request, 'handlePageFunction POSTPROCESSING', finishUserFn);
        tools.logPerformance(request, 'handlePageFunction EXECUTION', start);

        if (this.isDevRun && this.input.breakpointLocation === BREAKPOINT_LOCATIONS.AFTER_PAGE_FUNCTION) {
            await page.evaluate(async () => { debugger; }); // eslint-disable-line no-debugger
        }
    }

    async _handleMaxResultsPerCrawl(autoscaledPool) {
        if (!this.input.maxResultsPerCrawl || this.pagesOutputted < this.input.maxResultsPerCrawl) return false;
        log.info(`User set limit of ${this.input.maxResultsPerCrawl} results was reached. Finishing the crawl.`);
        await autoscaledPool.abort();
        return true;
    }

    async _handleLinks(page, request) {
        if (!(this.input.linkSelector && this.requestQueue)) return;
        const start = process.hrtime();

        const currentDepth = request.userData[META_KEY].depth;
        const hasReachedMaxDepth = this.input.maxCrawlingDepth && currentDepth >= this.input.maxCrawlingDepth;
        if (hasReachedMaxDepth) {
            log.debug(`Request ${request.url} reached the maximum crawling depth of ${currentDepth}.`);
            return;
        }

        const enqueueOptions = {
            page,
            selector: this.input.linkSelector,
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

        await Apify.utils.enqueueLinks(enqueueOptions);

        tools.logPerformance(request, 'handleLinks EXECUTION', start);
    }

    async _handleResult(request, response, pageFunctionResult, isError) {
        const start = process.hrtime();
        const payload = tools.createDatasetPayload(request, response, pageFunctionResult, isError);
        await this.dataset.pushData(payload);
        this.pagesOutputted++;
        tools.logPerformance(request, 'handleResult EXECUTION', start);
    }

    async _assertNamespace(page, namespace) {
        try {
            await page.waitForFunction((nmspc) => !!window[nmspc], { timeout: this.input.pageLoadTimeoutSecs * 1000 }, namespace);
        } catch (err) {
            if (err.stack.startsWith('TimeoutError')) {
                throw new Error('Injection of environment into the browser context timed out. '
                    + 'If this persists even after retries, try increasing the Page load timeout input setting.');
            } else {
                throw err;
            }
        }
    }

    async _waitForLoadEventWhenXml(page, response) {
        // Response can sometimes be null.
        if (!response) return;

        const cTypeHeader = response.headers()['content-type'];
        try {
            const { type } = contentType.parse(cTypeHeader);
            if (!/^(text|application)\/xml$|\+xml$/.test(type)) return;
        } catch (err) {
            // Invalid type is not XML.
            return;
        }

        try {
            const timeout = this.input.pageLoadTimeoutSecs * 1000;
            await page.waitForFunction(() => document.readyState === 'complete', { timeout });
        } catch (err) {
            if (err.stack.startsWith('TimeoutError')) {
                throw new Error('Parsing of XML in the page timed out. If you\'re expecting a large XML file, '
                    + ' such as a site map, try increasing the Page load timeout input setting.');
            } else {
                throw err;
            }
        }
    }

    async _injectBrowserHandles(page, pageContext) {
        const saveSnapshotP = browserTools.createBrowserHandle(page, () => browserTools.saveSnapshot({ page }));
        const skipLinksP = browserTools.createBrowserHandle(page, () => { pageContext.skipLinks = true; });
        const globalStoreP = browserTools.createBrowserHandlesForObject(
            page,
            this.globalStore,
            ['size', 'clear', 'delete', 'entries', 'get', 'has', 'keys', 'set', 'values'],
            ['size'],
        );
        const logP = browserTools.createBrowserHandlesForObject(
            page,
            log,
            ['LEVELS', 'setLevel', 'getLevel', 'debug', 'info', 'warning', 'error', 'exception'],
        );
        const requestQueueP = this.requestQueue
            ? browserTools.createBrowserHandlesForObject(page, this.requestQueue, ['addRequest'])
            : null;
        const keyValueStoreP = this.keyValueStore
            ? browserTools.createBrowserHandlesForObject(page, this.keyValueStore, ['getValue', 'setValue'])
            : null;

        const [
            saveSnapshot,
            skipLinks,
            globalStore,
            logHandle,
            requestQueue,
            keyValueStore,
        ] = await Promise.all([saveSnapshotP, skipLinksP, globalStoreP, logP, requestQueueP, keyValueStoreP]);

        const handles = {
            saveSnapshot,
            skipLinks,
            globalStore,
            log: logHandle,
            keyValueStore,
        };
        if (requestQueue) handles.requestQueue = requestQueue;
        return handles;
    }
}

module.exports = CrawlerSetup;

function logDevRunWarning() {
    log.warning(`
*****************************************************************
*          Web Scraper is running in DEVELOPMENT MODE!          *
*       Concurrency is limited, sessionPool is not available,   *
*       timeouts are increased and debugger is enabled.         *
*       If you want full control and performance switch         *
*                    Run type to PRODUCTION!                    *
*****************************************************************
`);
}
