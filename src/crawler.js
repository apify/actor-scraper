import Apify from 'apify';
import EventEmitter from 'events';
import { logDebug, logError } from './utils';
import * as utils from './puppeteer_utils';
import Request, { TYPES as REQUEST_TYPES } from './request';

const PUPPETEER_CONFIG = {
    dumpio: true,
    slowMo: 500,
};

const ENQUEUED_REQUEST_DEFAULTS = {
    label: '',
    type: REQUEST_TYPES.USER_ENQUEUED,
};

// @TODO validate properties
export default class Crawler extends EventEmitter {
    constructor(crawlerConfig) {
        super();
        this.crawlerConfig = crawlerConfig;
        this.browser = null;
    }

    _emitRequest(originalRequest, newRequest) {
        const linking = {
            referrer: originalRequest,
            depth: originalRequest.depth + 1,
        };

        this.emit('request', Object.assign({}, ENQUEUED_REQUEST_DEFAULTS, linking, newRequest));
    }

    _newRequest(request) {
        return new Request(this.crawlerConfig, request);
    }

    async initialize() {
        this.browser = await Apify.launchPuppeteer(PUPPETEER_CONFIG);
    }

    async destroy() {
        await this.browser.close();
    }

    async crawl(request) {
        const page = await this.browser.newPage();

        page.on('console', message => logDebug(`Console [${message.type}]: ${message.text}`));
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
            await page.goto(request.url);
            await this._processRequest(page, request);
            await page.close();
        } catch (err) {
            await page.close();
            throw err;
        }
    }

    async _processRequest(page, request) {
        request.loadingStartedAt = new Date();
        request.loadedUrl = page.url();

        const promises = [];
        const contextVars = {
            request,
            customData: this.crawlerConfig.customData,
            REQUEST_TYPES,
        };
        const contextMethods = {
            enqueuePage: newRequest => this._emitRequest(request, newRequest),
            newRequest: requestOpts => this._newRequest(Object.assign({}, requestOpts, { referrer: request })),
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
    }
}
