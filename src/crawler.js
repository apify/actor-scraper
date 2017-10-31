import Apify from 'apify';
import { logDebug } from './utils';
import * as utils from './puppeteer_utils';

export const CRAWLER_OPTIONS = ['pageFunction', 'injectJQuery'];

const PUPPETEER_CONF = { dumpio: true };

const execPageFunction = async (page, opts) => {
    const promises = [];

    promises.push(utils.waitForBody(page));
    promises.push(utils.injectContext(page));

    if (opts.injectJQuery) promises.push(utils.injectJQueryScript(page));

    await Promise.all(promises);

    return utils.executePageFunction(page, opts.pageFunction);
};

const handleConsoleMessage = (message) => {
    logDebug(`Console [${message.type}]: ${message.text}`);
};

// @TODO validate properties
export default class Crawler {
    constructor(opts) {
        this.opts = opts;
        this.browser = null;
    }

    async initialize() {
        this.browser = await Apify.launchPuppeteer(PUPPETEER_CONF);
    }

    async destroy() {
        await this.browser.close();
    }

    async crawl(request) {
        const page = await this.browser.newPage();

        // We need to catch errors here in order to close opened page in
        // a case of an error and then we can rethrow it.
        try {
            await page.goto(request.url);
            page.on('console', handleConsoleMessage);
            const result = await execPageFunction(page, this.opts);
            await page.close();

            return result;
        } catch (err) {
            await page.close();
            throw err;
        }
    }
}
