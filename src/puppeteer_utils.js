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

export const injectUnderscoreScript = async (page) => {
    const underscorePath = path.resolve(path.join(__dirname, '../node_modules/underscore/underscore.js'));
    await page.addScriptTag({ path: underscorePath });
    await page.evaluate(() => {
        window.APIFY_CONTEXT = Object.assign({}, window.APIFY_CONTEXT, {
            underscoreJs: _.noConflict(),
        });
    });
};

export const injectContext = async (page, context) => {
    return page.evaluate((pageContext) => {
        window.APIFY_CONTEXT = Object.assign({}, window.APIFY_CONTEXT, pageContext);
    }, context);
};

export const waitForBody = async page => page.waitFor('body');

export const executePageFunction = async (page, pageFunction) => {
    return page.evaluate((pageFunctionStr) => {
        let willFinishLaterPromise;
        let willFinishLaterResolve;

        const context = Object.assign({}, window.APIFY_CONTEXT, {
            willFinishLater() {
                willFinishLaterPromise = new Promise((resolve) => {
                    willFinishLaterResolve = resolve;
                });
            },

            finish(data) {
                willFinishLaterResolve(data);
            },
        });

        const pageFunctionEvaled = eval(`(${pageFunctionStr})`); // eslint-disable-line no-eval
        const result = pageFunctionEvaled(context);

        return willFinishLaterPromise || result;
    }, pageFunction);
};

export const clickClickables = async (page, clickableElementsSelector, interceptRequest) => {
    console.log('CLICKING ELEMENTS');

    page.on('framenavigated', (evt) => {
        console.log('framenavigated');
        console.log(evt);

        return false;
    });

    await page.click('a');

    await new Promise(resolve => setTimeout(resolve, 5000));
};

// document.querySelectorAll
