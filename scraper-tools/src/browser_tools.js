const { inspect } = require('util');
const Apify = require('apify');

const tools = require('./tools');
const { RESOURCE_LOAD_ERROR_MESSAGE, SNAPSHOT } = require('./consts');

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
    return `if (typeof window['${namespace}'] !== 'object') window['${namespace}'] = {}; 
    window['${namespace}'].pageFunction = ${pageFunctionString}`;
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
 * Looks up a property descriptor for the given key in
 * the given object and its prototype chain.
 *
 * @param {Object} target
 * @param {string} key
 * @return {Object}
 */
const getPropertyDescriptor = (target, key) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
    if (descriptor) return descriptor;
    const prototype = Reflect.getPrototypeOf(target);
    if (prototype === Reflect.getPrototypeOf({})) return null;
    return getPropertyDescriptor(prototype, key);
};

/**
 * Exposes selected properties of an instance (of a Class or just an Object)
 * in the Browser context and returns their mapping.
 *
 * @param {Page} page
 * @param {Object} instance
 * @param {string[]} properties
 * @return {Promise<Object>}
 */
const createBrowserHandlesForObject = async (page, instance, properties) => {
    const promises = properties
        .map((prop) => {
            const descriptor = getPropertyDescriptor(instance, prop);
            if (!descriptor) {
                throw new Error(`Cannot create a browser handle for property: ${prop} on object ${instance}. No such property descriptor.`);
            }
            if (descriptor.value) {
                return {
                    name: prop,
                    value: descriptor.value,
                    type: typeof descriptor.value === 'function' ? 'METHOD' : 'VALUE',
                };
            }
            if (descriptor.get) {
                return {
                    name: prop,
                    value: descriptor.get,
                    type: 'GETTER',
                };
            }
            throw new Error(`Cannot create a browser handle for property: ${prop} on object ${instance}. No getter or value for descriptor.`);
        })
        .map(async ({ name, value, type }) => {
            if (/^METHOD|GETTER$/.test(type)) value = await createBrowserHandle(page, value.bind(instance));
            return { name, value, type };
        });
    const props = await Promise.all(promises);
    return props.reduce((mappings, { name, value, type }) => {
        mappings[name] = { value, type };
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
 * Tracking variable for snapshot throttling.
 * @type {number}
 */
let lastSnapshotTimestamp = 0;

/**
 * Saves raw HTML and a screenshot to the default key value store
 * under the SNAPSHOT-HTML and SNAPSHOT-SCREENSHOT keys.
 *
 * @param {Object} options
 * @param {Page} [options.page]
 * @param {Cheerio} [options.$]
 * @return {Promise}
 */
const saveSnapshot = async ({ page, $ }) => {
    if (!page && !$) throw new Error('One of parameters "page" or "$" must be provided.');
    // Throttle snapshots.
    const now = Date.now();
    if (now - lastSnapshotTimestamp < SNAPSHOT.TIMEOUT_SECS * 1000) {
        log.warning('Aborting saveSnapshot(). It can only be invoked once '
            + `in ${SNAPSHOT.TIMEOUT_SECS} secs to prevent database overloading.`);
        return;
    }
    lastSnapshotTimestamp = now;

    if ($) {
        await Apify.setValue(SNAPSHOT.KEYS.HTML, $.html(), { contentType: 'text/html' });
    }
    if (page) {
        const htmlP = page.content();
        const screenshotP = page.screenshot();
        const [html, screenshot] = await Promise.all([htmlP, screenshotP]);
        await Promise.all([
            Apify.setValue(SNAPSHOT.KEYS.HTML, html, { contentType: 'text/html' }),
            Apify.setValue(SNAPSHOT.KEYS.SCREENSHOT, screenshot, { contentType: 'image/png' }),
        ]);
    }
};

module.exports = {
    wrapPageFunction,
    createBrowserHandle,
    createBrowserHandlesForObject,
    dumpConsole,
    saveSnapshot,
};
