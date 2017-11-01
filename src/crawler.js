import Apify from 'apify';
import { logDebug } from './utils';
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
};

const processRequest = async (page, request, opts) => {
    const promises = [];
    const context = {
        request,
        customData: opts.customData,
    };
    const waitForBodyAndClickClickablesPromise = utils
        .waitForBody(page)
        .then(() => utils.clickClickables(page, opts.clickableElementsSelector, opts.interceptRequest));

    promises.push(waitForBodyAndClickClickablesPromise);
    promises.push(utils.injectContext(page, context));

    if (opts.injectJQuery) promises.push(utils.injectJQueryScript(page));
    if (opts.injectUnderscoreJs) promises.push(utils.injectUnderscoreScript(page));

    await Promise.all(promises);

    return utils.executePageFunction(page, opts.pageFunction);
};

// @TODO validate properties
export default class Crawler {
    constructor(opts) {
        this.opts = opts;
        this.browser = null;
    }

    async initialize() {
        this.browser = await Apify.launchPuppeteer(PUPPETEER_CONFIG);
    }

    async destroy() {
        await this.browser.close();
    }

    async crawl(request) {
        const page = await this.browser.newPage();

        page.on('console', (message) => {
            logDebug(`Console [${message.type}]: ${message.text}`);
        });

        // We need to catch errors here in order to close opened page in
        // a case of an error and then we can rethrow it.
        try {
            await page.goto(request.url);
            const result = await processRequest(page, request, this.opts);
            await page.close();

            return result;
        } catch (err) {
            await page.close();
            throw err;
        }
    }
}
