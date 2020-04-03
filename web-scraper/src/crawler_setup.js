const Apify = require('apify');
const _ = require('underscore');
const contentType = require('content-type');
const {
    tools,
    browserTools,
    constants: { META_KEY, DEFAULT_VIEWPORT, DEVTOOLS_TIMEOUT_SECS, PROXY_ROTATION_NAMES, SESSION_MAX_USAGE_COUNTS },
} = require('@apify/scraper-tools');

const { CHROME_DEBUGGER_PORT } = require('./consts');
const createBundle = require('./bundle.browser');
const { startDebuggerServer } = require('./debugger/server');
const SCHEMA = require('../INPUT_SCHEMA');
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
 * @property {boolean} useRequestQueue
 * @property {Object[]} pseudoUrls
 * @property {string} linkSelector
 * @property {boolean} keepUrlFragments
 * @property {string} pageFunction
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
 */

/**
 * Holds all the information necessary for constructing a crawler
 * instance and creating a context for a pageFunction invocation.
 */
class CrawlerSetup {
    /* eslint-disable class-methods-use-this */
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
        if (this.input.pseudoUrls.length && !this.input.useRequestQueue) {
            throw new Error('Cannot enqueue links using Pseudo-URLs without using a request queue. '
                + 'Either enable the "Use request queue" option or '
                + 'remove your Pseudo-URLs.');
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
        // solving proxy rotation settings
        this.maxSessionUsageCount = SESSION_MAX_USAGE_COUNTS[this.input.proxyRotation];

        if (this.maxSessionUsageCount && this.input.proxyConfiguration && !input.proxyConfiguration.useApifyProxy) {
            throw new Error('Setting other than "Recommended" proxy rotation is allowed only when Apify Proxy is used in either '
                + '"automatic" or "selected proxy groups" mode. Custom proxies are automatically rotated one by one.');
        }
        tools.evalFunctionOrThrow(this.input.pageFunction);

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
            gotoFunction: this._gotoFunction.bind(this),
            handleFailedRequestFunction: this._handleFailedRequestFunction.bind(this),
            maxConcurrency: this.isDevRun ? MAX_CONCURRENCY_IN_DEVELOPMENT : this.input.maxConcurrency,
            maxRequestRetries: this.input.maxRequestRetries,
            maxRequestsPerCrawl: this.input.maxPagesPerCrawl,
            proxyUrls: this.input.proxyConfiguration.proxyUrls,
            launchPuppeteerFunction: async (launchOpts) => {
                const browser = await Apify.launchPuppeteer(launchOpts);
                if (this.isDevRun) await startDebuggerServer(process.env.APIFY_CONTAINER_PORT);
                return browser;
            },
            puppeteerPoolOptions: {
                recycleDiskCache: true,
            },
            launchPuppeteerOptions: {
                ...(_.omit(this.input.proxyConfiguration, 'proxyUrls')),
                ignoreHTTPSErrors: this.input.ignoreSslErrors,
                defaultViewport: DEFAULT_VIEWPORT,
                useChrome: this.input.useChrome,
                stealth: this.input.useStealth,
                args,
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
        if (this.isDevRun) {
            options.puppeteerPoolOptions.retireInstanceAfterRequestCount = Infinity;
        }

        this.crawler = new Apify.PuppeteerCrawler(options);

        if (this.isDevRun) logDevRunWarning();
        return this.crawler;
    }

    async _gotoFunction({ request, page, session }) {
        const start = process.hrtime();

        // Create a new page context with a new random key for Apify namespace.
        const pageContext = {
            apifyNamespace: await tools.createRandomHash(),
            skipLinks: false,
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
            const cookiesToSet = tools.getMissingCookiesFromSession(session, this.input.initialCookies, request.url);
            if (cookiesToSet && cookiesToSet.length) {
                // setting initial cookies that are not already in the session and page
                session.setPuppeteerCookies(cookiesToSet, request.url);
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
        // Invoke navigation.
        const navStart = process.hrtime();
        const response = await puppeteer.gotoExtended(page, request, {
            timeout: (this.isDevRun ? DEVTOOLS_TIMEOUT_SECS : this.input.pageLoadTimeoutSecs) * 1000,
            waitUntil: this.input.waitUntil,
        });
        await this._waitForLoadEventWhenXml(page, response);
        tools.logPerformance(request, 'gotoFunction NAVIGATION', navStart);

        const delayStart = process.hrtime();
        await this._assertNamespace(page, pageContext.apifyNamespace);

        // Inject selected libraries
        if (this.input.injectJQuery) await puppeteer.injectJQuery(page);
        if (this.input.injectUnderscore) await puppeteer.injectUnderscore(page);

        tools.logPerformance(request, 'gotoFunction INJECTION DELAY', delayStart);
        tools.logPerformance(request, 'gotoFunction EXECUTION', start);
        return response;
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
    async _handlePageFunction({ request, response, page, autoscaledPool }) {
        const start = process.hrtime();

        const pageContext = this.pageContexts.get(page);

        /**
         * PRE-PROCESSING
         */
        // Make sure that an object containing internal metadata
        // is present on every request.
        tools.ensureMetaData(request);

        // Abort the crawler if the maximum number of results was reached.
        const aborted = await this._handleMaxResultsPerCrawl(autoscaledPool);
        if (aborted) return;

        // Setup Context and pass the configuration down to Browser.
        const contextOptions = {
            crawlerSetup: Object.assign(
                _.pick(this, ['rawInput', 'env']),
                _.pick(this.input, ['customData', 'useRequestQueue', 'injectJQuery', 'injectUnderscore']),
                { META_KEY },
            ),
            browserHandles: pageContext.browserHandles,
            pageFunctionArguments: {
                request,
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
        await Apify.pushData(payload);
        this.pagesOutputted++;
        tools.logPerformance(request, 'handleResult EXECUTION', start);
    }

    async _assertNamespace(page, namespace) {
        try {
            await page.waitFor(nmspc => !!window[nmspc], { timeout: this.input.pageLoadTimeoutSecs * 1000 }, namespace);
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
            await page.waitFor(() => document.readyState === 'complete', { timeout });
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
        );
        const logP = browserTools.createBrowserHandlesForObject(
            page,
            log,
            ['LEVELS', 'setLevel', 'getLevel', 'debug', 'info', 'warning', 'error', 'exception'],
        );
        const apifyP = browserTools.createBrowserHandlesForObject(page, Apify, ['getValue', 'setValue']);
        const requestQueueP = this.requestQueue
            ? browserTools.createBrowserHandlesForObject(page, this.requestQueue, ['addRequest'])
            : null;

        const [
            saveSnapshot,
            skipLinks,
            globalStore,
            logHandle,
            apify,
            requestQueue,
        ] = await Promise.all([saveSnapshotP, skipLinksP, globalStoreP, logP, apifyP, requestQueueP]);

        const handles = {
            saveSnapshot,
            skipLinks,
            globalStore,
            log: logHandle,
            apify,
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
*  Concurrency is limited, timeouts are increased and debugger  *
*  is enabled. If you want full control and performance switch  *
*                    Run type to PRODUCTION!                    *
*****************************************************************
`);
}
