/**
 * IMPORTANT: because of Babel we can't import any variable that's used in page.evaluate(() => { ... });
 *            for example we can't import underscore since "_" is used in injectUnderscoreScript
 *            otherwise Babel will replace that with "_underscore2" and breaks the code.
 */
import path from 'path';
import { chain } from 'underscore';

export const injectJQueryScript = async (page) => {
    const jQueryPath = path.resolve(path.join(__dirname, '../node_modules/jquery/dist/jquery.js'));
    await page.addScriptTag({ path: jQueryPath });
    await page.evaluate(() => {
        console.log('Injecting jQuery');
        window.APIFY_CONTEXT = window.APIFY_CONTEXT || {};
        window.APIFY_CONTEXT.jQuery = jQuery.noConflict(true);
    });
};

export const injectUnderscoreScript = async (page) => {
    const underscorePath = path.resolve(path.join(__dirname, '../node_modules/underscore/underscore.js'));
    await page.addScriptTag({ path: underscorePath });
    await page.evaluate(() => {
        console.log('Injecting underscore');
        window.APIFY_CONTEXT = window.APIFY_CONTEXT || {};
        window.APIFY_CONTEXT.underscoreJs = _.noConflict();
    });
};

export const injectContext = async (page, contextVars) => {
    return page.evaluate((passedVars) => {
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
            window.APIFY_CONTEXT[passedName] = window[passedExposedName];
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
    return page.evaluate((passedInterceptRequestStr) => {
        console.log('Decorating context.enqueuePage()');

        if (!passedInterceptRequestStr) passedInterceptRequestStr = 'function (ctx, req) { return req; }';

        const interceptRequest = eval(`(${passedInterceptRequestStr})`);  // eslint-disable-line no-eval
        const context = window.APIFY_CONTEXT;
        const originalEnqueuePage = context.enqueuePage;

        if (typeof interceptRequest !== 'function') throw new Error('InterceptRequest must be a function string!');

        context.enqueuePage = async (requestOpts, clickedElement = null) => {
            const newRequest = await context.newRequest(requestOpts);
            const interceptRequestContext = {
                request: context.request,
                jQuery: context.jQuery,
                underscoreJs: context.underscoreJs,
                clickedElement,
            };
            const interceptedRequest = interceptRequest(interceptRequestContext, newRequest);

            await originalEnqueuePage(interceptedRequest);
        };
    }, interceptRequestStr);
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

        context.finish = data => willFinishLaterResolve(data);

        const pageFunctionEvaled = eval(`(${passedCrawlerConfig.pageFunction})`); // eslint-disable-line no-eval
        const result = pageFunctionEvaled(context);

        return willFinishLaterPromise || result;
    }, crawlerConfig);
};

export const clickClickables = async (page, clickableElementsSelector) => {
    console.log('Clicking elements');

    return page.evaluate((passedClickableElementsSelector) => {
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
