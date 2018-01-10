/**
 * This module is implementation of crawler.
 *
 * From outside we use only crawler.crawl(request) to process the request. Crawler opens the page
 * and executes page function. The result and additional info gets saved into the request.
 * If anything fails then crawler.crawl(request) throws an error and caller is responsible to
 * log error info and add that info to the request.
 *
 * At the beginning it creates pool of crawlerConfig.browserInstanceCount Puppeteer browsers.
 * It randomly switches requests between then and restarts the browsers after
 * crawlerConfig.maxCrawledPagesPerSlave requests. This is happening in order to rotate proxy
 * IPs.
 *
 * Crawler emits events:
 * - EVENT_REQUEST on newly created request to be possibly enqueued
 * - EVENT_SNAPSHOT with screenshot and html to be saved into key-value store.
 */

import _ from 'underscore';
import Apify from 'apify';
import { logError, logInfo } from './utils'; // logDebug, logInfo

export const EVENT_REQUEST = 'request';
export const EVENT_SNAPSHOT = 'snapshot';

const BROWSER_KILLER_INTERVAL_MILLIS = 60 * 1000;
const KILL_BROWSER_AFTER_MILLIS = 5 * 60 * 1000;

const PUPPETEER_CONFIG = {
    dumpio: process.env.NODE_ENV !== 'production',
    slowMo: 0,
    args: [],
};

class Browser {
    constructor(id, browserPromise) {
        this.id = id;
        this.crawledPages = 0;
        this.browserPromise = browserPromise;
        this.lastNewPage = Date.now();
        this.retired = true;
    }
}

const getPuppeteerConfig = ({ userAgent, dumpio, disableWebSecurity, proxyUrl }) => {
    const config = Object.assign({}, PUPPETEER_CONFIG);

    if (userAgent) config.userAgent = userAgent;
    if (dumpio !== undefined) config.dumpio = dumpio;
    if (proxyUrl) config.proxyUrl = proxyUrl;
    if (disableWebSecurity) {
        config.ignoreHTTPSErrors = true;
        config.args.push('--disable-web-security');
    }

    return config;
};

export default class PuppeteerPool {
    constructor(crawlerConfig) {
        this.browserCounter = 0;
        this.puppeteerConfig = getPuppeteerConfig(crawlerConfig);
        this.maxCrawledPagesPerSlave = crawlerConfig.maxCrawledPagesPerSlave;
        this.currentBrowser = this._createBrowser();
        this.retiredBrowsers = {};
        this.browserKillerInterval = setInterval(() => this._killRetiredBrowsers(), BROWSER_KILLER_INTERVAL_MILLIS);
    }

    _createBrowser() {
        const puppeteerPromise = Apify.launchPuppeteer(this.puppeteerConfig);
        const browser = new Browser(this.browserCounter++, puppeteerPromise);

        browser.browserPromise.then((puppeteerBrowser) => {
            puppeteerBrowser.on('disconnected', () => {
                logError('Puppeteer sent "disconnect" event. Crashed???');

                if (!browser.retired) this._retireCurrentBrowser();
            });
        });

        return browser;
    }

    _retireCurrentBrowser() {
        logInfo('PuppeteerPool: retiring browser');
        const currentBrowser = this.currentBrowser;
        currentBrowser.retired = true;
        this.retiredBrowsers[currentBrowser.id] = currentBrowser;
        this.currentBrowser = this._createBrowser();
    }

    _killBrowser(browser) {
        logInfo(`PuppeteerPool: killing browser ${browser.id}`);

        delete this.retiredBrowsers[browser.id];

        browser
            .browserPromise
            .then(puppeteerBrowser => puppeteerBrowser.close())
            .catch(err => logError('PuppeteerPool: cannot close the browser instance', err));
    }

    async _killRetiredBrowsers() {
        logInfo(`PuppeteerPool: retired browsers count: ${_.values(this.retiredBrowsers).length}`);

        _.mapObject(this.retiredBrowsers, (browser) => {
            if (Date.now() - browser.lastNewPage > KILL_BROWSER_AFTER_MILLIS) return this._killBrowser(browser);

            browser
                .browserPromise
                .then(puppeteerBrowser => puppeteerBrowser.pages())
                .catch(() => this._killBrowser(browser))
                .then((pages) => {
                    if (pages.length === 0) return this._killBrowser(browser);
                });
        });
    }

    async newPage() {
        const browser = this.currentBrowser;

        browser.lastNewPage = Date.now();
        browser.crawledPages++;

        if (browser.crawledPages > this.maxCrawledPagesPerSlave) this._retireCurrentBrowser();

        const puppeteerBrowser = await browser.browserPromise;

        return puppeteerBrowser.newPage();
    }

    /**
     * Kills all the resources - opened browsers and intervals.
     */
    async destroy() {
        clearInterval(this.browserKillerInterval);

        const browserPromises = _
            .values(this.retiredBrowsers)
            .concat(this.currentBrowser)
            .map(browser => browser.browserPromise);

        const closePromises = browserPromises.map((browserPromise) => {
            return browserPromise.then(puppeteer => puppeteer.close());
        });

        return Promise
            .all(closePromises)
            .catch(err => logError('PuppeteerPool: cannot close the browsers', err));
    }
}
