/**
 * This module contains mix of helper functions.
 */

import _ from 'underscore';
import Apify from 'apify';
import uuidv4 from 'uuid/v4';
import Promise from 'bluebird';
import { parseType, parsedTypeCheck } from 'type-check';

const { NODE_ENV } = process.env;
const SET_VALUE_MAX_REPEATS = 10;

export const log = (message, level) => console.log(`${level}:  ${message}`);
export const logInfo = message => log(message, 'INFO');

/**
 * Because there are tents of duplicite error messaages we remember the last one and print `... REPEATED XXX times`
 * for duplicite errors to logError() calls;
 */
let prevErrorMsg;
let prevErrorRepeats = 0;
export const logError = (message, error) => {
    const errorMsg = `${message} ${error}`;

    if (errorMsg !== prevErrorMsg) {
        if (prevErrorRepeats) console.log(`... REPEATED ${prevErrorRepeats} times`);
        if (errorMsg.includes('Protocol error (Network.getResponseBody)') || errorMsg.includes('Error: net::ERR_NAME_NOT_RESOLVED')) {
            log(errorMsg, 'ERROR');
        } else {
            console.log(error); // Prints error stack.
        }
        prevErrorMsg = errorMsg;
        prevErrorRepeats = 0;
    } else {
        prevErrorRepeats++;
    }
};
export const logDebug = NODE_ENV === 'production'
    ? () => {}
    : message => log(message, 'DEBUG');

export const isNullOrUndefined = val => _.isNull(val) || _.isUndefined(val);

export const sum = arr => arr.reduce((total, current) => total + current, 0);

/**
 * Parses an URL and returns an object with its components.
 * Code inspired by http://blog.stevenlevithan.com/archives/parseuri
 */
export const parseUrl = (str) => {
    if (typeof (str) !== 'string') { return {}; }
    const o = {
        strictMode: false,
        key: ['source', 'protocol', 'authority', 'userInfo', 'user', 'password', 'host', 'port', 'relative', 'path', 'directory', 'file', 'query', 'fragment'],
        q: {
            name: 'queryKey',
            parser: /(?:^|&)([^&=]*)=?([^&]*)/g,
        },
        parser: {
            strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
            loose: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/,
        },
    };
    const m = o.parser[o.strictMode ? 'strict' : 'loose'].exec(str);
    const uri = {};
    let i = o.key.length;

    while (i--) uri[o.key[i]] = m[i] || '';

    uri[o.q.name] = {};
    uri[o.key[12]].replace(o.q.parser, ($0, $1, $2) => {
        if ($1) uri[o.q.name][$1] = $2;
    });

    // our extension - parse fragment using a query string format (i.e. "#key1=val1&key2=val2")
    // this format is used by many websites
    uri.fragmentKey = {};
    if (uri.fragment) {
        uri.fragment.replace(o.q.parser, ($0, $1, $2) => {
            if ($1) uri.fragmentKey[$1] = $2;
        });
    }

    return uri;
};


/**
 * This function checks that a URL is a valid HTTP/HTTPS link, adds "http://" prefix if URL has no protocol specified
 * and trims the whitespaces around the URL.
 * @param url
 * @returns {*} Returns a fixed valid URL or null if the URL is not valid.
 */
export const fixUrl = (url) => {
    if (typeof (url) !== 'string') { return null; }

    url = url.trim();

    const parsedUrl = exports.parseUrl(url);
    if (!parsedUrl.host) { return null; }

    if (!parsedUrl.protocol) { url = `http://${url}`; } else if (!parsedUrl.protocol.match(/^(http|https)$/i)) { return null; }

    return url;
};

/**
 * Normalizes given URL to URL hash. Single URL hash should represent
 * single content, even thought it's hosted on multiple different urls.
 * WARNING: use only for URL deduplication - resolved URLs may not work
 * with original host.
 *
 * Operations:
 *  - converts hostname and protocol to lower-case
 *  - removes trailing slash
 *  - removes common tracking parameters, such as utm_source, ...
 *  - sorts query parameters alphabetically
 *  - trims whitespaces around all components of the URL
 *
 *  @param  {String}  url   The original url
 *  @param  {String}  keepFragment   If true, the URL fragment is kept in the normalized URL, otherwise it's removed.
 *  @return {String} The normalized URL useful for deduplication, or null if the URL was invalid.
 */
export const normalizeUrl = (url, keepFragment) => {
    if (typeof url !== 'string' || !url.length) {
        return null;
    }

    const urlObj = exports.parseUrl(url.trim());
    if (!urlObj.protocol || !urlObj.host) {
        return null;
    }

    const path = urlObj.path.replace(/\/$/, '');
    const params = (urlObj.query
            ? urlObj.query
                    .split('&')
                    .filter((param) => {
                        return !/^utm_/.test(param);
                    })
                    .sort()
            : []
        );

    return `${urlObj.protocol.trim().toLowerCase()
         }://${
         urlObj.host.trim().toLowerCase()
         }${path.trim()
         }${params.length ? `?${params.join('&').trim()}` : ''
         }${keepFragment && urlObj.fragment ? `#${urlObj.fragment.trim()}` : ''}`;
};

export const getValueOrUndefined = async (key) => {
    const value = await Apify
        .getValue(key)
        .catch(() => undefined);

    return value || undefined;
};


/**
 * These functions are wrapper to Apify.setValue() and keeping array of pending
 * promises.
 */
const pendingSetValues = {};

export const setValue = async ({ key, body, contentType, recursion = 0 }) => {
    const uuid = uuidv4();
    const opts = contentType ? { contentType } : undefined;

    if (contentType) opts.contentType = contentType;

    logInfo(`Saving value ${key}`);

    const promise = Apify
        .setValue(key, body, opts)
        .then(() => {
            delete pendingSetValues[uuid];
        })
        // TODO: this might be removed as we added backoff for network errors ...
        .catch((err) => {
            if (recursion > SET_VALUE_MAX_REPEATS) {
                logError(`Cannot set value ${key} in iteration ${recursion}, giving up`, err);
                return;
            }

            logError(`Cannot set value ${key} in iteration ${recursion}, trying once again`, err);
            setTimeout(() => setValue({ key, body, contentType, recursion: recursion + 1 }), 15 * 1000);
        });

    pendingSetValues[uuid] = promise;

    return promise;
};

export const waitForPendingSetValues = async () => {
    return Promise.all(_.values(pendingSetValues));
};

/**
 * Wrapper to typeCheck() displaying meaningful message.
 */
export const checkParamOrThrow = (value, name, type, message) => {
    if (!message) message = `Parameter "${name}" of type ${type} must be provided`;

    const allowedTypes = parseType(type);

    const allowsBuffer = allowedTypes.filter(item => item.type === 'Buffer').length;
    const allowsPromise = allowedTypes.filter(item => item.type === 'Promise').length;

    if (allowsBuffer && Buffer.isBuffer(value)) return;
    if (allowsPromise && typeof value.then === 'function') return;

    // This will ignore Buffer type.
    if (!parsedTypeCheck(allowedTypes, value)) throw new Error(message);
};

export const deleteNullProperties = (obj) => {
    _.mapObject(obj, (val, key) => {
        if (val === null) delete obj[key];
    });
};
