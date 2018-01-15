/**
 * This module is implementation of crawler.
 *
 * From outside we use only crawler.crawl(request) to process the request. Crawler opens the page
 * and executes page function. The result and additional info gets saved into the request.
 * If anything fails then crawler.crawl(request) throws an error and caller is responsible to
 * log error info and add that info to the request.
 *
 * Crawler emits events:
 * - EVENT_REQUEST on newly created request to be possibly enqueued
 * - EVENT_SNAPSHOT with screenshot and html to be saved into key-value store.
 */

import _ from 'underscore';
import EventEmitter from 'events';
import Promise from 'bluebird';
import { logError, logDebug, logInfo } from './utils';
import * as utils from './puppeteer_utils';
import Request, { TYPES as REQUEST_TYPES } from './request';

export const EVENT_REQUEST = 'request';
export const EVENT_SNAPSHOT = 'snapshot';

export default class Crawler extends EventEmitter {
    constructor(crawlerConfig, puppeteerPool) {
        super();
        this.crawlerConfig = crawlerConfig;
        this.gotoOptions = {};
        this.puppeteerPool = puppeteerPool;

        if (crawlerConfig.pageLoadTimeout) {
            this.gotoOptions.timeout = crawlerConfig.pageLoadTimeout;
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
    async _emitSnapshot(page, request, opts = { html: true, screenshot: true }) {
        const { fullPage, quality, type } = opts;
        const html = opts.html ? await page.$eval('html', el => el.outerHTML) : null;
        const screenshot = opts.screenshot ? await page.screenshot({ quality, fullPage, type }) : null;
        const requestId = request.id;

        this.emit(EVENT_SNAPSHOT, { requestId, html, screenshot });
    }

    /**
     * Kills all the resources - opened browsers and intervals.
     */
    async destroy() {
        clearInterval(this.logInterval);
    }

    /**
     * Performs the given request.
     * It's wrapper for this._processRequest doing try/catch, loggint of console messages, errors, etc.
     */
    async crawl(request) {
        let page;
        let timeout;

        // We need to catch errors here in order to close opened page in
        // a case of an error and then we can rethrow it.
        try {
            page = await this.puppeteerPool.newPage();
            page.on('error', (error) => {
                logError('Crawler: page crashled', error);
                page.close();
                page = null;
            });
            if (this.crawlerConfig.dumpio) page.on('console', message => logDebug(`Chrome console: ${message.text}`));

            // Creating timeout to be sure that page don't stuck - set to 10 minutes
            timeout = setTimeout(() => {
                const border = '------------------------\n------------------------\n------------------------';
                logInfo(`${border}\nKilling a page that is running tooooo loooong\n${border}`);
                page.close();
            }, 10 * 60 * 1000);

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

            request.requestedAt = new Date();
            // If initial cookies were set use them to all page
            if (this.crawlerConfig.cookies && this.crawlerConfig.cookies.length) {
                await page.setCookie(...this.crawlerConfig.cookies);
            }
            await page.goto(request.url, this.gotoOptions);
            await this._processRequest(page, request);
            clearTimeout(timeout);
            await page.close();
        } catch (err) {
            clearTimeout(timeout);
            try {
                if (page) await page.close();
            } catch (pageCloseErr) {
                logError('Crawler: cannot close the page', pageCloseErr);
            }
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
            saveSnapshot: (opts) => {
                beforeEndPromises.push(this._emitSnapshot(page, request, opts));
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

        if (this.crawlerConfig.maxInfiniteScrollHeight) promises.push(utils.infiniteScroll(page, this.crawlerConfig.maxInfiniteScrollHeight));
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
