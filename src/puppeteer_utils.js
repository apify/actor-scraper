import path from 'path';

export const injectJQueryScript = async (page) => {
    const jQueryPath = path.resolve(path.join(__dirname, '../node_modules/jquery/dist/jquery.js'));
    await page.addScriptTag({ path: jQueryPath });
    await page.evaluate(() => {
        window.APIFY_CONTEXT = Object.assign({}, window.APIFY_CONTEXT, {
            jQuery: jQuery.noConflict(true),
        });
    });
};

export const injectContext = async (page) => {
    const context = { foo: 'bar' };

    return page.evaluate((pageContext) => {
        window.APIFY_CONTEXT = Object.assign({}, window.APIFY_CONTEXT, pageContext);
    }, context);
};

export const waitForBody = async page => page.waitFor('body');

export const executePageFunction = async (page, pageFunction) => {
    return page.evaluate((pageFunctionStr) => {
        const pageFunctionEvaled = eval(`(${pageFunctionStr})`); // eslint-disable-line no-eval

        return pageFunctionEvaled(window.APIFY_CONTEXT);
    }, pageFunction);
};
