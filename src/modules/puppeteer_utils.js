/**
 * This module contains helper puppeteer utilities.
 *
 * IMPORTANT: because of Babel we can't import any variable that's used in page.evaluate(() => { ... });
 *            for example we can't import underscore since "_" is used in injectUnderscoreScript
 *            otherwise Babel will replace that with "_underscore2" and breaks the code.
 */
import fs from 'fs';
import path from 'path';
import { chain } from 'underscore';
import { ENQUEUE_PAGE_ALLOWED_PROPERTIES } from './request';
import { logInfo, logDebug, logError } from './utils';

export const injectFile = async (page, filePath) => {
    const contents = await new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) return reject(err);
            resolve(data);
        });
    });

    return page.evaluate(contents);
};

export const injectJQueryScript = async (page) => {
    const jQueryPath = path.resolve(path.join(__dirname, '../../node_modules/jquery/dist/jquery.js'));
    await injectFile(page, jQueryPath);
    await page.evaluate(() => {
        console.log('Injecting jQuery');
        window.APIFY_CONTEXT = window.APIFY_CONTEXT || {};
        window.APIFY_CONTEXT.jQuery = jQuery.noConflict(true);
    });
};

export const injectUnderscoreScript = async (page) => {
    const underscorePath = path.resolve(path.join(__dirname, '../../node_modules/underscore/underscore.js'));
    await injectFile(page, underscorePath);
    await page.evaluate(() => {
        console.log('Injecting underscore');
        window.APIFY_CONTEXT = window.APIFY_CONTEXT || {};
        window.APIFY_CONTEXT.underscoreJs = _.noConflict();
    });
};

/**
 * Injects given map of variables to the page as window.APIFY_CONTEXT[key].
 * It can't inject methods only variables as actId, ... .
 */
export const injectContext = async (page, contextVars) => {
    return page.evaluate((passedVars) => {
        console.log(window.location.href);
        console.log('Injecting context');
        window.APIFY_CONTEXT = window.APIFY_CONTEXT || {};
        Object.assign(window.APIFY_CONTEXT, passedVars);
    }, contextVars);
};

/**
 * Waits for body to get loaded.
 */
export const waitForBody = async page => page.waitFor('body', { timeout: 15000 }); // @TODO put this timeout into configuration

/**
 * Helper function that creates unique name for exposed method.
 */
const getExposedMethodName = name => `APIFY_FUNCTION_${name}`;

/**
 * Exposes given method under window.APIFY_CONTEXT[name].
 */
const exposeMethod = async (page, method, name) => {
    const exposedName = getExposedMethodName(name);

    return page
        .exposeFunction(exposedName, method)
        .then(() => page.evaluate((passedExposedName, passedName) => {
            console.log(`Exposing window.${passedExposedName}() as context.${passedName}()`);
            window.APIFY_CONTEXT = window.APIFY_CONTEXT || {};

            const context = window.APIFY_CONTEXT;

            // All the exposed methods are async and return promise so we register them in
            // window.APIFY_CONTEXT.pendingPromises and await them after page function finishes
            // to ensure they get finished.
            window.APIFY_CONTEXT.pendingPromises = window.APIFY_CONTEXT.pendingPromises || {};
            window.APIFY_CONTEXT[passedName] = (...args) => {
                const promise = window[passedExposedName](...args);
                const id = Math.random();

                window.APIFY_CONTEXT.pendingPromises[id] = promise;

                // If call succeedes or fails we can delete it from window.APIFY_CONTEXT.pendingPromises.
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

/**
 * Exposes given map of methods to the page under window.APIFY_CONTEXT[key].
 */
export const exposeMethods = async (page, methods) => {
    const promises = chain(methods)
        .mapObject((method, name) => exposeMethod(page, method, name))
        .toArray()
        .value();

    return Promise.all(promises);
};

/**
 * Uff this method is complicated. It decorates window.APIFY_CONTEXT.enqueuePage()
 * with intercept request function so that the each enqueued request gets passed
 * thru the intercept request function.
 */
export const decorateEnqueuePage = async (page, interceptRequestStr) => {
    if (!interceptRequestStr) interceptRequestStr = 'function (ctx, req) { return req; }';

    await page.evaluate(`window.APIFY_INTERCEPT_REQUEST = ${interceptRequestStr};`);

    return page.evaluate((allowedFields) => {
        console.log('Decorating context.enqueuePage()');

        const context = window.APIFY_CONTEXT;
        const originalEnqueuePage = context.enqueuePage;

        if (typeof window.APIFY_INTERCEPT_REQUEST !== 'function') throw new Error('InterceptRequest must be a function!');

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
            const interceptedRequest = window.APIFY_INTERCEPT_REQUEST(interceptRequestContext, newRequest);

            await originalEnqueuePage(interceptedRequest);
        };
    }, ENQUEUE_PAGE_ALLOWED_PROPERTIES);
};

/**
 * Executes page function in a context of the page.
 */
export const executePageFunction = async (page, crawlerConfig) => {
    await page.evaluate(`window.APIFY_PAGE_FUNCTION = ${crawlerConfig.pageFunction};`);

    return page.evaluate((passedCrawlerConfig) => {
        console.log('Running page function');

        const context = window.APIFY_CONTEXT;
        const startedAt = new Date();

        // If context.willFinishLater() or context.finish() was called then
        // we creates a promise that gets saved here and returned at the end.
        // This way Puppeteer's evaluate() method knows that needs to wait for
        // this promise to gets resolved.
        let willFinishLaterPromise;
        let willFinishLaterResolve;
        let willFinishLaterReject;

        // If context.willFinishLater() gets called then we register timeout
        // to ensure that this always finishes.
        let pageFunctionTimeout;

        context.willFinishLater = () => {
            // Register promise.
            willFinishLaterPromise = new Promise((resolve, reject) => {
                willFinishLaterResolve = resolve;
                willFinishLaterReject = reject;
            });

            // Create timeout.
            const remainsMillis = passedCrawlerConfig.pageFunctionTimeout - (new Date() - startedAt);
            pageFunctionTimeout = setTimeout(() => {
                willFinishLaterReject(new Error('PageFunction timeouted'));
            }, remainsMillis);
        };

        context.finish = (data) => {
            if (willFinishLaterResolve) return willFinishLaterResolve(data);

            // This happens when context.finish() was called but context.willFinishLater() wasn't.
            // We need to create resolved promise to return data passed to context.finish().
            willFinishLaterPromise = Promise.resolve(data);
        };

        try {
            if (typeof window.APIFY_PAGE_FUNCTION !== 'function') throw new Error('PageFunction must be a function!');

            const pageFunctionResult = window.APIFY_PAGE_FUNCTION(context);

            return Promise
                .all(Object.values(context.pendingPromises)) // Pending calls to exposed methods like enqueuePage() ...
                .then(() => willFinishLaterPromise || Promise.resolve(pageFunctionResult))
                .then((result) => {
                    clearTimeout(pageFunctionTimeout);
                    console.log('Page function done');

                    return result;
                });
        } catch (err) {
            return Promise.reject(err);
        }
    }, crawlerConfig);
};

/**
 * Searches for all links matching clickableElementsSelector selector and enqueues
 * their target urls using exposed window.APIFY_CONTEXT.enqueuePage().
 */
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
        forgotten: 0,
    };
    const pendingRequests = {};
    page.on('request', (msg) => {
        if (maybeResourceTypesInfiniteScroll.includes(msg.resourceType)) {
            pendingRequests[msg._requestId] = Date.now();
            resourcesStats.requested++;
        }
    });
    page.on('requestfailed', (msg) => {
        if (maybeResourceTypesInfiniteScroll.includes(msg.resourceType)) {
            if (pendingRequests[msg._requestId]) {
                delete pendingRequests[msg._requestId];
                resourcesStats.failed++;
            }

        }
    });
    page.on('requestfinished', (msg) => {
        if (maybeResourceTypesInfiniteScroll.includes(msg.resourceType)) {
            if (pendingRequests[msg._requestId]) {
                delete pendingRequests[msg._requestId];
                resourcesStats.finished++;
            }
        }
    });

    try {
        let scrollInfo = await getPageScrollInfo(page);
        logInfo(`Infinite scroll started (${stringifyScrollInfo(scrollInfo)}).`);

        while (true) {
            scrollInfo = await getPageScrollInfo(page);

            // Forget pending resources that didn't finish loading in time
            const now = Date.now();
            const timeout = 30000; // TODO: use resourceTimeout
            Object.keys(pendingRequests).forEach((requestId) => {
                if (pendingRequests[requestId] + timeout < now) {
                    delete pendingRequests[requestId];
                    resourcesStats.forgotten++;
                }
            });

            logDebug(`Infinite scroll stats (${stringifyScrollInfo(scrollInfo)} resourcesStats=${JSON.stringify(resourcesStats)}).`);

            const pendingRequestsCount = resourcesStats.requested - (resourcesStats.finished + resourcesStats.failed + resourcesStats.forgotten);
            if (pendingRequestsCount === 0) {
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
