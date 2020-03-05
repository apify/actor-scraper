/**
 * Represents the key under which internal metadata
 * such as crawling depth are stored on the Request object.
 * @type {string}
 */
exports.META_KEY = '__scraper-metadata__';

/**
 * The default resolution to be used by the browser instances.
 * @type {{width: number, height: number}}
 */
exports.DEFAULT_VIEWPORT = {
    width: 1920,
    height: 1080,
};

/**
 * Error message produced by Browser on failed resource load. This is used to
 * suppress logging of this message when blocking resources.
 * @type {string}
 */
exports.RESOURCE_LOAD_ERROR_MESSAGE = 'Failed to load resource: net::ERR_FAILED';

/**
 * Name of file that holds Page Function in local development.
 * @type {string}
 */
exports.PAGE_FUNCTION_FILENAME = 'page_function.js';

/**
 * Just a handlePageFunction timeout value for when DevTools are used
 * so the user has time to browse the DevTools console.
 * @type {number}
 */
exports.DEVTOOLS_TIMEOUT_SECS = 3600;

/**
 * Represents the keys under which saveSnapshot() will
 * persist to key value store and the throttling timeout.
 * @type {{KEYS: Object, TIMEOUT_SECS: number}}
 */
exports.SNAPSHOT = {
    KEYS: {
        BODY: 'SNAPSHOT-BODY',
        SCREENSHOT: 'SNAPSHOT-SCREENSHOT',
    },
    TIMEOUT_SECS: 2,
};

/**
 * Enum values used in the Proxy Rotation (proxyRotation) input option.
 * Make sure those are always in sync!
 * @type {{RECOMMENDED: 'RECOMMENDED', PER_REQUEST: 'PER_REQUEST', UNTIL_FAILURE: 'UNTIL_FAILURE'}}
 */
const PROXY_ROTATION_NAMES = {
    UNTIL_FAILURE: 'UNTIL_FAILURE',
    PER_REQUEST: 'PER_REQUEST',
    RECOMMENDED: 'RECOMMENDED',
};
exports.PROXY_ROTATION_NAMES = PROXY_ROTATION_NAMES;

/**
 * Max usage counts of a Session per different available proxy rotations.
 * @type {{ "UNTIL_FAILURE": number,  "PER_REQUEST": number, "RECOMMENDED": undefined}}
 */
exports.SESSION_MAX_USAGE_COUNTS = {
    [PROXY_ROTATION_NAMES.UNTIL_FAILURE]: 1000,
    [PROXY_ROTATION_NAMES.PER_REQUEST]: 1,
    [PROXY_ROTATION_NAMES.RECOMMENDED]: undefined,
};
