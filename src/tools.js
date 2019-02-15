const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify, inspect } = require('util');

const Apify = require('apify');
const _ = require('underscore');
const Ajv = require('ajv');

const { META_KEY, RESOURCE_LOAD_ERROR_MESSAGE, PAGE_FUNCTION_FILENAME, SNAPSHOT } = require('./consts');
const schema = require('../INPUT_SCHEMA.json');

const { utils: { log, puppeteer } } = Apify;

exports.wrapPageFunction = (pageFunctionString, namespace) => {
    return `window['${namespace}'].pageFunction = ${pageFunctionString}`;
};

/**
 * Wraps Apify.utils.puppeteer.enqueueLinks with metadata-adding logic
 * to enable depth tracking in requests.
 *
 * @param {Page} page
 * @param {string} linkSelector
 * @param {Object[]} pseudoUrls
 * @param {RequestQueue} requestQueue
 * @param {Request} parentRequest
 * @return {Promise}
 */
exports.enqueueLinks = async (page, linkSelector, pseudoUrls, requestQueue, parentRequest) => {
    const parentDepth = parentRequest.userData[META_KEY].depth || 0;
    const depthMeta = {
        depth: parentDepth + 1,
        parentRequestId: parentRequest.id,
        childRequestIds: {},
    };
    const userData = { [META_KEY]: depthMeta };
    const queueOperationInfos = await puppeteer.enqueueLinks({
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

exports.checkInputOrThrow = (input) => {
    const ajv = new Ajv({ allErrors: true, useDefaults: true });
    const valid = ajv.validate(schema, input);
    if (!valid) throw new Error(`Invalid input:\n${JSON.stringify(ajv.errors, null, 2)}`);
};

/**
 * MODIFIES the provided Request by attaching necessary metadata.
 * Currently it only adds depth metadata, but it may be extended
 * as needed.
 *
 * @param {Request} request
 */
exports.ensureMetaData = ({ id, userData }) => {
    const metadata = userData[META_KEY];
    if (!metadata) {
        userData[META_KEY] = {
            depth: 0,
            parentRequestId: null,
            childRequestIds: {},
        };
        return;
    }
    if (typeof metadata !== 'object') throw new Error(`Request ${id} contains invalid metadata value.`);
};

/**
 * Merges the result of the page function, that may be a single object
 * or an array objects, with request metadata and a flag, whether
 * an error occured. This would typically be used after the page
 * had been retried and the handleFailedRequestFunction was called.
 *
 * If an Object[] is returned from the page function, each of the objects
 * will have the metadata appended for consistency, since the dataset
 * will flatten the results.
 *
 * @param {Request} request
 * @param {Object|Object[]} pageFunctionResult
 * @param {Boolean} [isError]
 * @returns {Object[]}
 */
exports.createDatasetPayload = (request, pageFunctionResult, isError = false) => {
    // Null and undefined do not prevent the payload
    // from being saved to dataset. It will just contain
    // the relevant metadata.
    let result = pageFunctionResult || {};

    // Validate the result.
    const type = typeof result;
    if (type !== 'object') {
        throw new Error(`Page function must return Object | Object[], but it returned ${type}.`);
    }

    // Metadata need to be appended to each item
    // to match results with dataset "lines".
    if (!Array.isArray(result)) result = [result];
    const meta = {
        '#error': isError,
        '#debug': _.pick(request, ['url', 'method', 'retryCount', 'errorMessages']),
    };
    meta['#debug'].requestId = request.id;

    return result.map(item => Object.assign({}, item, meta));
};

const randomBytes = promisify(crypto.randomBytes);

/**
 * Creates a 12 byte random hash encoded as base64
 * to be used as identifier.
 *
 * @return {Promise<string>}
 */
exports.createRandomHash = async () => {
    return (await randomBytes(12))
        .toString('base64')
        .replace(/[+/=]/g, 'x') // Remove invalid chars.
        .replace(/^\d/, 'a'); // Ensure first char is not a digit.
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
exports.createBrowserHandle = async (page, func) => {
    const handle = await exports.createRandomHash();
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
exports.createBrowserHandlesForObject = async (page, instance, methods) => {
    const selectedMethods = _.pick(instance, methods);
    const promises = Object
        .entries(selectedMethods)
        .map(async ([name, method]) => {
            const handle = await exports.createBrowserHandle(page, method.bind(instance));
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
exports.dumpConsole = (page, options = {}) => {
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
 * Checks whether an item is a plain object,
 * i.e. not a function or array as _.isObject()
 * would check for.
 * @param {*} item
 * @return {boolean}
 */
exports.isPlainObject = item => item && typeof item === 'object' && !Array.isArray(item);

/**
 * Helper that throws after timeout secs with the error message.
 * @param {number} timeoutSecs
 * @param {string} errorMessage
 * @return {Promise}
 */
exports.createTimeoutPromise = async (timeoutSecs, errorMessage) => {
    await new Promise(res => setTimeout(res, timeoutSecs * 1000));
    throw new Error(errorMessage);
};

/**
 * Enables the use of legacy willFinishLater by resolving a Promise
 * from within the browser context using the provided finish function.
 *
 * @return {Object}
 */
exports.createWillFinishLaterWrapper = () => {
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
 * Attempts to load Page Function from disk if it's not available
 * on INPUT.
 *
 * @param {Input} input
 */
exports.maybeLoadPageFunctionFromDisk = (input) => {
    if (input.pageFunction) return;
    const pageFunctionPath = path.join(__dirname, PAGE_FUNCTION_FILENAME);
    log.debug(`Loading Page Function from disk: ${path}`);
    try {
        input.pageFunction = fs.readFileSync(pageFunctionPath, 'utf8');
    } catch (err) {
        log.debug('Page Function load from disk failed.');
    }
};


/**
 * Since snapshots are throttled, this tells us when the last
 * snapshot was taken.
 */
let lastSnapshotTimestamp = 0;

/**
 * Saves raw HTML and a screenshot to the default key value store
 * under the SNAPSHOT-HTML and SNAPSHOT-SCREENSHOT keys.
 *
 * @param {Page} page
 */
exports.saveSnapshot = async (page) => {
    // Throttle snapshots.
    const now = Date.now();
    if (now - lastSnapshotTimestamp < SNAPSHOT.TIMEOUT_SECS * 1000) {
        log.warning(`Aborting saveSnapshot(). It can only be invoked once in ${SNAPSHOT.TIMEOUT_SECS} secs to prevent database overloading.`);
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
