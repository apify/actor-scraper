import Apify from 'apify';
import _ from 'underscore';
import EventEmitter from 'events';
import Promise from 'bluebird';
import { logError, logDebug } from './utils';
import * as utils from './puppeteer_utils';
import Request, { TYPES as REQUEST_TYPES } from './request';

export const EVENT_REQUEST = 'request';
export const EVENT_SNAPSHOT = 'snapshot';

const PUPPETEER_CONFIG = {
    dumpio: true,
    slowMo: 500,
    headless: true,
};

export default class Crawler extends EventEmitter {
    constructor(crawlerConfig) {
        super();
        this.crawlerConfig = crawlerConfig;
        this.browser = null;
        this.gotoOptions = {};
        this.browsers = [];
        this.browserPosition = 0;
        this.requestsInProgress = _.times(crawlerConfig.browserInstanceCount, () => 0);
        this.requestsTotal = _.times(crawlerConfig.browserInstanceCount, () => 0);
        this.customProxiesPosition = 0;

        if (crawlerConfig.browserInstanceCount * crawlerConfig.maxCrawledPagesPerSlave < crawlerConfig.maxParallelRequests) {
            throw new Error('"browserInstanceCount * maxCrawledPagesPerSlave" must be higher than "maxParallelRequests"!!!!');
        }

        if (crawlerConfig.pageLoadTimeout) {
            this.gotoOptions.pageLoadTimeout = pageLoadTimeout;
        }
    }

    /**
     * Emits new request as event to be enqueued.
     */
    _emitRequest(originalRequest, newRequest) {
        _.extend(newRequest, {
            referrer: originalRequest,
            depth: originalRequest.depth + 1,
        });

        this.emit(EVENT_REQUEST, newRequest);
    }

    /**
     * Creates new request instance from given configuration.
     */
    _newRequest(request) {
        return new Request(this.crawlerConfig, request);
    }

    /**
     * Emits snapshot event.
     */
    async _emitSnapshot(page, request) {
        this.emit(EVENT_SNAPSHOT, {
            url: request.url,
            html: await page.$eval('html', el => el.outerHTML),
            screenshot: await page.screenshot(),
        });
    }

    async _launchPuppeteer() {
        const config = Object.assign({}, PUPPETEER_CONFIG);
        const customProxies = this.crawlerConfig.customProxies;

        if (customProxies && customProxies.length) {
            config.proxyUrl = customProxies[this.customProxiesPosition];

            this.customProxiesPosition ++;

            if (this.customProxiesPosition >= customProxies.length) this.customProxiesPosition = 0;
        }

        return Apify.launchPuppeteer(config);
    }

    /**
     * Initializes puppeteer - starts the browser.
     */
    async initialize() {
        logDebug(`Crawler: initializing ${this.crawlerConfig.browserInstanceCount} browsers`);

        this.browsers = _
            .range(0, this.crawlerConfig.browserInstanceCount)
            .map(() => this._launchPuppeteer());


        return Promise.all(this.browsers);
    }

    /**
     * Kills all the resources - browser.
     */
    async destroy() {
        const promises = this
            .browsers
            .map((browserPromise) => {
                return browserPromise.then(browser => browser.close());
            });

        return Promise.all(promises);
    }

    /**
     * Returns ID of browser that can perform given request.
     */
    _getAvailableBrowserId() {
        logDebug(`Crawler: browser requests total       ${this.requestsTotal.join(', ')}`);
        logDebug(`Crawler: browser requests in progress ${this.requestsInProgress.join(', ')}`);

        const pos = this.browserPosition;
        const maxCrawledPagesPerSlave = this.maxCrawledPagesPerSlave;

        this.browserPosition ++;

        if (this.browserPosition >= this.browsers.length) {
            this.browserPosition = 0;
        }

        if (this.requestsTotal[pos] === maxCrawledPagesPerSlave && this.requestsInProgress[pos] === 0) {
            logDebug(`Crawler: relaunching browser id ${pos}`);
            this.browsers[pos] = this._launchPuppeteer();
            this.requestsTotal[pos] = 0;

            return pos;
        }

        if (this.requestsTotal[pos] >= maxCrawledPagesPerSlave) {
            return this._getAvailableBrowserId();
        }

        return pos;
    }

    /**
     * Performs the given request.
     * It's wrapper for this._processRequest doing try/catch, loggint of console messages, errors, etc.
     */
    async crawl(request) {
        const browserId = this._getAvailableBrowserId();

        this.requestsInProgress[browserId] ++;
        this.requestsTotal[browserId] ++;

        const browser = await this.browsers[browserId];
        const page = await browser.newPage();

        page.on('error', error => logError('Page error', error));

        // Save stats about all the responses (html file + assets).
        // First response is main html page followed with assets or iframes.
        let isFirstResponse = true;
        page.on('response', async (response) => {
            if (isFirstResponse) {
                request.responseStatus = response.status;
                request.responseHeaders = response.headers;
                isFirstResponse = false;
            }

            const buffer = await response.buffer();
            request.downloadedBytes += buffer.length;
        });

        // We need to catch errors here in order to close opened page in
        // a case of an error and then we can rethrow it.
        try {
            request.requestedAt = new Date();
            await page.goto(request.url, this.gotoOptions);
            await this._processRequest(page, request);
            await page.close();
            this.requestsInProgress[browserId] --;
        } catch (err) {
            await page.close();
            this.requestsInProgress[browserId] --;
            throw err;
        }
    }

    /**
     * Processes given request:
     * - exposes crawler methods (enqueuePage, ...) to the browser
     * - exposes context variables
     * - clicks elements
     * - runs pageFunction
     */
    async _processRequest(page, request) {
        const beforeEndPromises = [];

        request.loadingStartedAt = new Date();
        request.loadedUrl = page.url();

        const promises = [];
        const contextVars = {
            request,
            customData: this.crawlerConfig.customData,
            REQUEST_TYPES,
        };
        const contextMethods = {
            enqueuePage: (newRequest) => {
                // @TODO: TEMP hack because the requests comming from context.enqueuePage are not real requests.
                if (!(newRequest instanceof Request)) newRequest = this._newRequest(newRequest);

                this._emitRequest(request, newRequest);
            },
            newRequest: requestOpts => this._newRequest(Object.assign({}, requestOpts, { referrer: request })),
            saveSnapshot: () => {
                beforeEndPromises.push(this._emitSnapshot(page, request));
            },
            skipOutput: () => {
                request.skipOutput = true;
            },
            skipLinks: () => console.log('WARNING: skip links are not implemented yet.'),
        };
        const waitForBodyPromise = utils
            .waitForBody(page)
            .then(() => {
                request.loadingFinishedAt = new Date();
            });

        promises.push(waitForBodyPromise);
        promises.push(utils.waitForBody(page));
        promises.push(utils.injectContext(page, contextVars));
        promises.push(utils.exposeMethods(page, contextMethods));

        if (this.crawlerConfig.injectJQuery) promises.push(utils.injectJQueryScript(page));
        if (this.crawlerConfig.injectUnderscoreJs) promises.push(utils.injectUnderscoreScript(page));

        await Promise.all(promises);
        await utils.decorateEnqueuePage(page, this.crawlerConfig.interceptRequest);
        await utils.clickClickables(page, this.crawlerConfig.clickableElementsSelector);

        request.pageFunctionStartedAt = new Date();
        request.pageFunctionResult = await utils.executePageFunction(page, this.crawlerConfig);
        request.pageFunctionFinishedAt = new Date();

        await Promise.all(beforeEndPromises);
    }
}
