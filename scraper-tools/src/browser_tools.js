const { inspect } = require('util');
const _ = require('underscore');
const Apify = require('apify');

const tools = require('./tools');
const { META_KEY, RESOURCE_LOAD_ERROR_MESSAGE, SNAPSHOT } = require('./consts');

const { utils: { log } } = Apify;

/**
 * Creates a string with an appended pageFunction to be evaluated in
 * the browser context and placed within the given namespace.
 *
 * @param {string} pageFunctionString
 * @param {string} namespace
 * @return {string}
 */
const wrapPageFunction = (pageFunctionString, namespace) => {
    return `window['${namespace}'].pageFunction = ${pageFunctionString}`;
};

/**
 * Wraps Apify.utils.enqueueLinks with metadata-adding logic
 * to enable depth tracking in requests.
 *
 * @param {Page} options
 * @param {Page} options.page
 * @param {string} options.linkSelector
 * @param {Object[]} options.pseudoUrls
 * @param {RequestQueue} options.requestQueue
 * @param {Request} options.parentRequest
 * @return {Promise}
 */
const enqueueLinks = async ({ page, linkSelector, pseudoUrls, requestQueue, parentRequest }) => {
    const parentDepth = parentRequest.userData[META_KEY].depth || 0;
    const depthMeta = {
        depth: parentDepth + 1,
        parentRequestId: parentRequest.id,
        childRequestIds: {},
    };
    const userData = { [META_KEY]: depthMeta };
    const queueOperationInfos = await Apify.utils.enqueueLinks({
        page,
        selector: linkSelector,
        requestQueue,
        pseudoUrls,
        userData,
    });

    queueOperationInfos.forEach(({ requestId }) => {
        parentRequest.userData[META_KEY].childRequestIds[requestId] = 1;
    });
};

/**
 * Attaches the provided function to the Browser context
 * by exposing it via page.exposeFunction. Returns a string
 * handle to be used to reference the exposed function in
 * the browser context.
 *
 * @param {Page} page
 * @param {Function} func
 * @returns {string}
 */
const createBrowserHandle = async (page, func) => {
    const handle = await tools.createRandomHash();
    await page.exposeFunction(handle, func);
    return handle;
};

/**
 * Exposes selected methods of an instance (of a Class or just an Object)
 * in the Browser context and returns their mapping.
 *
 * @param {Page} page
 * @param {Object} instance
 * @param {string[]} methods
 * @return {Promise<Object>}
 */
const createBrowserHandlesForObject = async (page, instance, methods) => {
    const selectedMethods = _.pick(instance, methods);
    const promises = Object
        .entries(selectedMethods)
        .map(async ([name, method]) => {
            const handle = await createBrowserHandle(page, method.bind(instance));
            return { name, handle };
        });
    const props = await Promise.all(promises);
    return props.reduce((mappings, prop) => {
        mappings[prop.name] = prop.handle;
        return mappings;
    }, {});
};


/**
 * Attaches a console listener to page's console that
 * mirrors all console messages to the Node context.
 *
 * This is used instead of the "dumpio" launch option
 * to prevent cluttering the STDOUT with unnecessary
 * Chromium messages, usually internal errors, occuring in page.
 * @param {Page} page
 * @param {Object} [options]
 * @param {boolean} [options.logErrors=false]
 *   Prevents Browser context errors from being logged by default,
 *   since there are usually a lot of errors produced by scraping
 *   due to blocking resources, running headless, etc.
 */
const dumpConsole = (page, options = {}) => {
    page.on('console', async (msg) => {
        if (msg.type() === 'error' && !options.logErrors) return;

        // Do not ever log "Failed to load resource" errors, because they flood the log.
        if (msg.text() === RESOURCE_LOAD_ERROR_MESSAGE) return;

        // Check for JSHandle tags in .text(), since .args() will
        // always include JSHandles, even for strings.
        const hasJSHandles = msg.text().includes('JSHandle@');

        // If there are any unresolved JSHandles, get their JSON representations.
        // Otherwise, just use the text immediately.
        let message;
        if (hasJSHandles) {
            const msgPromises = msg.args().map((jsh) => {
                return jsh.jsonValue()
                    .catch(e => log.exception(e, `Stringification of console.${msg.type()} in browser failed.`));
            });
            message = (await Promise.all(msgPromises))
                .map(m => inspect(m))
                .join(' '); // console.log('a', 'b') produces 'a b'
        } else {
            message = msg.text();
        }
        if (log[msg.type()]) log[msg.type()](message);
        else log.info(message);
    });
};

/**
 * Enables the use of legacy willFinishLater by resolving a Promise
 * from within the browser context using the provided finish function.
 *
 * @return {Object}
 */
const createWillFinishLaterWrapper = () => {
    const wrapper = {
        promise: null,
        finish: (result) => {
            log.debug('context.finish() was called!');
            wrapper.resolve(result);
        },
        resolve: () => { throw new Error('maybeWillFinishLater was not called.'); },
        maybeWillFinishLater: () => {
            wrapper.promise = new Promise((res) => { wrapper.resolve = res; });
        },
    };
    return wrapper;
};

/**
 * Tracking variable for snapshot throttling.
 * @type {number}
 */
let lastSnapshotTimestamp = 0;

/**
 * Saves raw HTML and a screenshot to the default key value store
 * under the SNAPSHOT-HTML and SNAPSHOT-SCREENSHOT keys.
 *
 * @param {Page} page
 * @return {Promise}
 */
const saveSnapshot = async (page) => {
    // Throttle snapshots.
    const now = Date.now();
    if (now - lastSnapshotTimestamp < SNAPSHOT.TIMEOUT_SECS * 1000) {
        log.warning('Aborting saveSnapshot(). It can only be invoked once '
                + `in ${SNAPSHOT.TIMEOUT_SECS} secs to prevent database overloading.`);
        return;
    }
    lastSnapshotTimestamp = now;

    const htmlP = page.content();
    const screenshotP = page.screenshot();
    const [html, screenshot] = await Promise.all([htmlP, screenshotP]);
    await Promise.all([
        Apify.setValue(SNAPSHOT.KEYS.HTML, html, { contentType: 'text/html' }),
        Apify.setValue(SNAPSHOT.KEYS.SCREENSHOT, screenshot, { contentType: 'image/png' }),
    ]);
};

module.exports = {
    wrapPageFunction,
    enqueueLinks,
    createBrowserHandle,
    createBrowserHandlesForObject,
    dumpConsole,
    createWillFinishLaterWrapper,
    saveSnapshot,
};
