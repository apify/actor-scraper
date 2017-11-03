import Apify from 'apify';
import EventEmitter from 'events';
import { logDebug, logError } from './utils';
import * as utils from './puppeteer_utils';

export const CRAWLER_OPTIONS = [
    'clickableElementsSelector',
    'customData',
    'injectJQuery',
    'injectUnderscoreJs',
    'interceptRequest',
    'pageFunction',
];

const PUPPETEER_CONFIG = {
    dumpio: true,
    slowMo: 500,
};

const REQUEST_DEFAULTS = {
    label: '',
};

// @TODO validate properties
export default class Crawler extends EventEmitter {
    constructor(opts) {
        super();
        this.opts = opts;
        this.browser = null;
    }

    _emitRequest(request) {
        this.emit('request', Object.assign({}, REQUEST_DEFAULTS, request));
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
        page.on('frameattached', () => logDebug('Event: frameattached'));
        page.on('framedetached', () => logDebug('Event: framedetached'));
        page.on('framenavigated', () => logDebug('Event: framenavigated'));
        page.on('load', () => logDebug('Event: load'));

        // We need to catch errors here in order to close opened page in
        // a case of an error and then we can rethrow it.
        try {
            await page.goto(request.url);
            const result = await this._processRequest(page, request);
            await page.close();

            return result;
        } catch (err) {
            await page.close();
            throw err;
        }
    }

    async _processRequest(page, request) {
        const promises = [];
        const contextVars = {
            request,
            customData: this.opts.customData,
        };
        const contextMethods = {
            enqueuePage: newRequest => this._emitRequest(newRequest),
        };

        const waitForBodyAndClickClickablesPromise = utils
            .waitForBody(page);
            // .then(() => utils.clickClickables(page, request, this.opts.clickableElementsSelector, this.opts.interceptRequest));

        promises.push(waitForBodyAndClickClickablesPromise);
        promises.push(utils.injectContext(page, contextVars));
        promises.push(utils.exposeMethods(page, contextMethods));

        if (this.opts.injectJQuery) promises.push(utils.injectJQueryScript(page));
        if (this.opts.injectUnderscoreJs) promises.push(utils.injectUnderscoreScript(page));

        await Promise.all(promises);

        return utils.executePageFunction(page, this.opts);
    }
}
