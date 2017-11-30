/**
 * IMPORTANT: because of Babel we can't import any variable that's used in page.evaluate(() => { ... });
 *            for example we can't import underscore since "_" is used in injectUnderscoreScript
 *            otherwise Babel will replace that with "_underscore2" and breaks the code.
 */
import path from 'path';
import { chain } from 'underscore';
import { ENQUEUE_PAGE_ALLOWED_PROPERTIES } from './request';
import { logInfo, logDebug, logError } from './utils';

export const injectJQueryScript = async (page) => {
    const jQueryPath = path.resolve(path.join(__dirname, '../../node_modules/jquery/dist/jquery.js'));
    await page.addScriptTag({ path: jQueryPath });
    await page.evaluate(() => {
        console.log('Injecting jQuery');
        window.APIFY_CONTEXT = window.APIFY_CONTEXT || {};
        window.APIFY_CONTEXT.jQuery = jQuery.noConflict(true);
    });
};

export const injectUnderscoreScript = async (page) => {
    const underscorePath = path.resolve(path.join(__dirname, '../../node_modules/underscore/underscore.js'));
    await page.addScriptTag({ path: underscorePath });
    await page.evaluate(() => {
        console.log('Injecting underscore');
        window.APIFY_CONTEXT = window.APIFY_CONTEXT || {};
        window.APIFY_CONTEXT.underscoreJs = _.noConflict();
    });
};

export const injectContext = async (page, contextVars) => {
    return page.evaluate((passedVars) => {
        console.log(window.location.href);
        console.log('Injecting context');
        window.APIFY_CONTEXT = window.APIFY_CONTEXT || {};
        Object.assign(window.APIFY_CONTEXT, passedVars);
    }, contextVars);
};

export const waitForBody = async page => page.waitFor('body');

const getExposedMethodName = name => `APIFY_FUNCTION_${name}`;

export const exposeMethod = async (page, method, name) => {
    const exposedName = getExposedMethodName(name);

    return page
        .exposeFunction(exposedName, method)
        .then(() => page.evaluate((passedExposedName, passedName) => {
            console.log(`Exposing window.${passedExposedName}() as context.${passedName}()`);
            window.APIFY_CONTEXT = window.APIFY_CONTEXT || {};

            const context = window.APIFY_CONTEXT;

            window.APIFY_CONTEXT.pendingPromises = window.APIFY_CONTEXT.pendingPromises || {};
            window.APIFY_CONTEXT[passedName] = (...args) => {
                const promise = window[passedExposedName](...args);
                const id = Math.random();

                window.APIFY_CONTEXT.pendingPromises[id] = promise;

                promise
                    .then(() => {
                        delete context.pendingPromises[id];
                    })
                    .catch((err) => {
                        delete context.pendingPromises[id];
                        throw err;
                    });

                return promise;
            };
        }, exposedName, name));
};

export const exposeMethods = async (page, methods) => {
    const promises = chain(methods)
        .mapObject((method, name) => exposeMethod(page, method, name))
        .toArray()
        .value();

    return Promise.all(promises);
};

export const decorateEnqueuePage = async (page, interceptRequestStr) => {
    return page.evaluate((passedInterceptRequestStr, allowedFields) => {
        console.log('Decorating context.enqueuePage()');

        if (!passedInterceptRequestStr) passedInterceptRequestStr = 'function (ctx, req) { return req; }';

        const interceptRequest = eval(`(${passedInterceptRequestStr})`);  // eslint-disable-line no-eval
        const context = window.APIFY_CONTEXT;
        const originalEnqueuePage = context.enqueuePage;

        if (typeof interceptRequest !== 'function') throw new Error('InterceptRequest must be a function string!');

        const pick = (obj, keys) => keys.reduce((result, key) => {
            if (obj[key] !== undefined) result[key] = obj[key];

            return result;
        }, {});

        context.enqueuePage = async (requestOpts, clickedElement = null) => {
            const newRequest = await context.newRequest(pick(requestOpts, allowedFields));
            const interceptRequestContext = {
                request: context.request,
                jQuery: context.jQuery,
                underscoreJs: context.underscoreJs,
                clickedElement,
            };
            const interceptedRequest = interceptRequest(interceptRequestContext, newRequest);

            console.log('Intercepted request:');
            console.log(JSON.stringify(interceptedRequest));

            await originalEnqueuePage(interceptedRequest);
        };
    }, interceptRequestStr, ENQUEUE_PAGE_ALLOWED_PROPERTIES);
};

export const executePageFunction = async (page, crawlerConfig) => {
    return page.evaluate((passedCrawlerConfig) => {
        console.log('Running page function');

        const context = window.APIFY_CONTEXT;

        let willFinishLaterPromise;
        let willFinishLaterResolve;

        context.willFinishLater = () => {
            willFinishLaterPromise = new Promise((resolve) => {
                willFinishLaterResolve = resolve;
            });
        };

        context.finish = (data) => {
            if (willFinishLaterResolve) return willFinishLaterResolve(data);

            // This happens when context.willFinishLater() wasn't called.
            willFinishLaterPromise = Promise.resolve(data);
        };

        const pageFunctionEvaled = eval(`(${passedCrawlerConfig.pageFunction})`); // eslint-disable-line no-eval
        const result = pageFunctionEvaled(context);

        console.log('Page function done');

        return Promise
            .all(Object.values(context.pendingPromises)) // Pending calls to exposed methods like enqueuePage() ...
            .then(() => willFinishLaterPromise || result);
    }, crawlerConfig);
};

export const clickClickables = async (page, clickableElementsSelector) => {
    return page.evaluate((passedClickableElementsSelector) => {
        console.log('Clicking elements');

        if (!passedClickableElementsSelector) return;

        const { enqueuePage, REQUEST_TYPES } = window.APIFY_CONTEXT;

        document
            .querySelectorAll(passedClickableElementsSelector)
            .forEach((el) => {
                const url = el.href;

                if (!url) return;

                enqueuePage({ url, type: REQUEST_TYPES.LINK_CLICKED });
            });
    }, clickableElementsSelector);
};

/**
 * Method scrolls page to xpos, ypos.
 */
export const scrollTo = (page, xpos, ypos) => page.evaluate((x, y) => window.scrollTo(x, y), xpos, ypos);

/**
 * Method returns info about page scroll
 */
export const getPageScrollInfo = page => page.evaluate(() => {
    return {
        scrollHeight: document.documentElement.scrollHeight,
        scrollTop: document.documentElement.scrollTop,
        clientHeight: document.documentElement.clientHeight,
    };
});

/**
 * Scroll to down page until infinite scroll ends or reaches maxHeight
 * @param page - instance of crawled page
 * @param maxHeight - max height of document to scroll
 * @return {Promise.<void>}
 */
export const infiniteScroll = async (page, maxHeight) => {
    const maybeResourceTypesInfiniteScroll = ['xhr', 'fetch', 'websocket', 'other'];
    const sleepPromised = ms => new Promise(resolve => setTimeout(resolve, ms));
    const stringifyScrollInfo = (scrollInfo) => {
        return `scrollTop=${scrollInfo.scrollTop}, ` +
            `clientHeight=${scrollInfo.clientHeight}, ` +
            `scrollHeight=${scrollInfo.scrollHeight}, ` +
            `maxHeight=${maxHeight}`;
    };
    const defaultScrollDelay = 500;

    // Catch and count all pages request for resources
    const resourcesStats = {
        requested: 0,
        finished: 0,
        failed: 0,
        //forgotten: 0, TODO: Implement something like forgotten requests like in phantomJS crawler
    };
    page.on('request', (msg) => {
        if (maybeResourceTypesInfiniteScroll.includes(msg.resourceType)) resourcesStats.requested++;
    });
    page.on('requestfailed', (msg) => {
        if (maybeResourceTypesInfiniteScroll.includes(msg.resourceType)) resourcesStats.failed++;
    });
    page.on('requestfinished', (msg) => {
        if (maybeResourceTypesInfiniteScroll.includes(msg.resourceType)) resourcesStats.finished++;
    });

    try {
        let scrollInfo = await getPageScrollInfo(page);
        logInfo(`Infinite scroll started (${stringifyScrollInfo(scrollInfo)}).`);

        while (true) {
            scrollInfo = await getPageScrollInfo(page);
            logDebug(`Infinite scroll stats (${stringifyScrollInfo(scrollInfo)}).`);

            const pendingRequests = resourcesStats.requested - (resourcesStats.finished + resourcesStats.failed);
            if (pendingRequests === 0) {
                // If the page is scrolled to the very bottom or beyond maximum height, we are done
                if (scrollInfo.scrollTop + scrollInfo.clientHeight >= Math.min(scrollInfo.scrollHeight, maxHeight)) break;
                // Otherwise we try to scroll down
                await scrollTo(page, 0, scrollInfo.scrollHeight);
            }

            await sleepPromised(defaultScrollDelay);
        }
        // Scroll back up, otherwise the screenshot of the browser would only show the bottom of the page
        await scrollTo(page, 0, 0);

        logInfo(`Infinite scroll finished (${stringifyScrollInfo(scrollInfo)} resourcesStats=${JSON.stringify(resourcesStats)})`);
    } catch (err) {
        logError('An exception thrown in infiniteScroll()', err);
    }
};
