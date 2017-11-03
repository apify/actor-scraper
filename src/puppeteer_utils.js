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

export const exposeMethods = async (page, functions) => {
    const promises = chain(functions)
        .mapObject((func, name) => {
            const exposedName = getExposedMethodName(name);

            return page
                .exposeFunction(exposedName, func)
                .then(() => page.evaluate((passedExposedName, passedName) => {
                    console.log(`Exposing window.${passedExposedName}() as context.${passedName}()`);
                    window.APIFY_CONTEXT = window.APIFY_CONTEXT || {};
                    window.APIFY_CONTEXT[passedName] = window[passedExposedName];
                }, exposedName, name));
        })
        .toArray()
        .value();

    return Promise.all(promises);
};

export const executePageFunction = async (page, opts) => {
    return page.evaluate((passedOpts) => {
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

        console.log(JSON.stringify(context.underscoreJs.keys(context)));
        console.log(typeof context.enqueuePage);

        const pageFunctionEvaled = eval(`(${passedOpts.pageFunction})`); // eslint-disable-line no-eval
        const result = pageFunctionEvaled(context);

        return willFinishLaterPromise || result;
    }, opts);
};

export const clickClickables = async (/* page, request, clickableElementsSelector, interceptRequest */) => {
    console.log('CLICKING ELEMENTS');

    // await page.setRequestInterceptionEnabled(true);
    /* page.on('request', (interceptedRequest) => {
        //console.log('request');
        //console.log(interceptedRequest);

        //interceptedRequest.abort();

        console.log(interceptedRequest.url);

        if (interceptedRequest.url !== request.url) {
            console.log('changing url');
            interceptedRequest.url = request.url;
        }

        interceptedRequest.continue();
    });

    const waitPromise = page.waitForNavigation();
    const clickPromise = page.click('a');

    console.log(await waitPromise);

    await clickPromise; */
};

// document.querySelectorAll
