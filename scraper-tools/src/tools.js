const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const _ = require('underscore');
const Ajv = require('ajv');
const Apify = require('apify');

const { META_KEY, PAGE_FUNCTION_FILENAME } = require('./consts');

const { utils: { log } } = Apify;
const randomBytes = promisify(crypto.randomBytes);

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
const createDatasetPayload = (request, pageFunctionResult, isError = false) => {
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
const isPlainObject = item => item && typeof item === 'object' && !Array.isArray(item);

/**
 * Helper that throws after timeout secs with the error message.
 * @param {number} timeoutSecs
 * @param {string} errorMessage
 * @return {Promise}
 */
const createTimeoutPromise = async (timeoutSecs, errorMessage) => {
    await new Promise(res => setTimeout(res, timeoutSecs * 1000));
    throw new Error(errorMessage);
};

/**
 * Attempts to load Page Function from disk if it's not available
 * on INPUT.
 *
 * @param {Input} input
 */
const maybeLoadPageFunctionFromDisk = (input) => {
    if (input.pageFunction) return;
    const pageFunctionPath = path.join(__dirname, PAGE_FUNCTION_FILENAME);
    log.debug(`Loading Page Function from disk: ${path}`);
    try {
        input.pageFunction = fs.readFileSync(pageFunctionPath, 'utf8');
    } catch (err) {
        log.debug('Page Function load from disk failed.');
    }
};

module.exports = {
    checkInputOrThrow,
    ensureMetaData,
    createDatasetPayload,
    createRandomHash,
    isPlainObject,
    createTimeoutPromise,
    maybeLoadPageFunctionFromDisk,
};
