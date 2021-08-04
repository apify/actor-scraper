const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const Ajv = require('ajv');
const Apify = require('apify');

const { META_KEY, PAGE_FUNCTION_FILENAME } = require('./consts');

const { utils: { log } } = Apify;
const randomBytes = promisify(crypto.randomBytes);

/**
 * Transforms a page function string into a Function object.
 * @param {string} funcString
 * @return {Function}
 */
const evalFunctionOrThrow = (funcString) => {
    let func;

    try {
        func = vm.runInThisContext(`(${funcString})`);
    } catch (err) {
        throw new Error(`Compilation of pageFunction failed.\n${err.message}\n${err.stack.substr(err.stack.indexOf('\n'))}`);
    }

    if (typeof func !== 'function') throw new Error('Input parameter "pageFunction" is not a function!');

    return func;
};

/**
 * Transforms a pre/post navigation hooks string into array of Functions.
 * @param {string} hooksString
 * @param {string} paramName
 * @return {Function[]}
 */
const evalFunctionArrayOrThrow = (hooksString, paramName) => {
    let arr;

    try {
        arr = vm.runInThisContext(`(${hooksString})`);
    } catch (err) {
        throw new Error(`Compilation of ${paramName} failed.\n${err.message}\n${err.stack.substr(err.stack.indexOf('\n'))}`);
    }

    if (!Array.isArray(arr)) {
        throw new Error(`Input parameter "${paramName}" is not an array!`);
    }

    if (arr.some((func) => typeof func !== 'function')) {
        throw new Error(`Input parameter "${paramName}" is not an array of functions!`);
    }

    return arr;
};

/**
 * Validates the INPUT using the AJV library against the schema.
 *
 * @param {Object} input
 * @param {Object} schema
 */
const checkInputOrThrow = (input, schema) => {
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
const ensureMetaData = ({ id, userData }) => {
    const metadata = userData[META_KEY];
    if (!metadata) {
        userData[META_KEY] = {
            depth: 0,
            parentRequestId: null,
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
 * @param {Response} response
 * @param {Object|Object[]} pageFunctionResult
 * @param {Boolean} [isError]
 * @returns {Object[]}
 */
const createDatasetPayload = (request, response, pageFunctionResult, isError = false) => {
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
        '#debug': Apify.utils.createRequestDebugInfo(request, response),
    };

    return result.map((item) => ({ ...item, ...meta }));
};

/**
 * Creates a 12 byte random hash encoded as base64
 * to be used as identifier.
 *
 * @return {Promise<string>}
 */
const createRandomHash = async () => {
    return (await randomBytes(12))
        .toString('base64')
        .replace(/[+/=]/g, 'x') // Remove invalid chars.
        .replace(/^\d/, 'a'); // Ensure first char is not a digit.
};

/**
 * Checks whether an item is a plain object,
 * i.e. not a function or array as _.isObject()
 * would check for.
 * @param {*} item
 * @return {boolean}
 */
const isPlainObject = (item) => item && typeof item === 'object' && !Array.isArray(item);

/**
 * Attempts to load Page Function from disk if it's not available
 * on INPUT.
 *
 * @param {Input} input
 */
const maybeLoadPageFunctionFromDisk = (input, root) => {
    if (input.pageFunction) return;
    const pageFunctionPath = path.join(root, PAGE_FUNCTION_FILENAME);
    log.debug(`Loading Page Function from disk: ${path}`);
    try {
        input.pageFunction = fs.readFileSync(pageFunctionPath, 'utf8');
    } catch (err) {
        log.exception(err, 'Page Function load from disk failed.');
    }
};

/**
 * Creates an error constructed using props
 * from the provided object.
 *
 * @param {Object} obj
 */
const createError = (obj = {}) => {
    const error = new Error(obj.message);
    error.stack = obj.stack;
    return error;
};

const logPerformance = (request, title, hrtime) => {
    if (log.getLevel() !== log.LEVELS.PERF) return;
    const runtime = process.hrtime(hrtime);
    const nanos = runtime[0] * 1e9 + runtime[1];
    const micros = nanos / 1000;
    const millis = micros / 1000;
    log.perf(`${request.id} ${title} took ${Math.round(millis)} ms.`);
};

/**
 * Accepts an array of cookies in a { name, value }
 * format and finds if any of them are missing from
 * the session cookies for a given URL.
 *
 * @param {Session} session
 * @param {Array} cookies
 * @param {String} url
 * @return {Array}
 */
const getMissingCookiesFromSession = (session, cookies, url) => {
    const sessionCookies = session.getPuppeteerCookies(url);
    return cookies.filter((c) => {
        const sessionHasCookie = sessionCookies.some((sc) => sc.name === c.name);
        return !sessionHasCookie;
    });
};

module.exports = {
    evalFunctionOrThrow,
    evalFunctionArrayOrThrow,
    checkInputOrThrow,
    ensureMetaData,
    createDatasetPayload,
    createRandomHash,
    isPlainObject,
    maybeLoadPageFunctionFromDisk,
    createError,
    logPerformance,
    getMissingCookiesFromSession,
};
