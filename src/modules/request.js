/**
 * This module defines the Request class which represents a single web page request.
 */

import _ from 'underscore';
import { normalizeUrl, isNullOrUndefined } from './utils';

const MAX_REFERRER_REQUEST_DEPTH = 3;

export const TYPES = {
    START_URL: 'START_URL',
    USER_ENQUEUED: 'USER_ENQUEUED',
    LINK_CLICKED: 'LINK_CLICKED',
};

export const QUEUE_POSITIONS = {
    FIRST: 'FIRST',
    LAST: 'LAST',
};

const ALWAYS_LOAD_FOR_TYPES = [TYPES.START_URL, TYPES.USER_ENQUEUED];

export const ENQUEUE_PAGE_ALLOWED_PROPERTIES = [
    'url',
    'uniqueKey',
    'label',
    'method',
    'postData',
    'contentType',
    'queuePosition',
    'interceptRequestData',
    'type', // @TODO maybe this should not be here
];

const REQUEST_DEFAULTS = {
    depth: 0,
    downloadedBytes: 0,
    willLoad: false,
    skipOutput: false,
    queuePosition: QUEUE_POSITIONS.LAST,
    errorInfo: [],
    type: TYPES.USER_ENQUEUED,
    label: '',
};

export const PROPERTIES = [
    // An auto-incremented ID
    'id',
    // Indicates the label specified in startUrls or crawlPurls config settings where URL/PURL corresponds
    // to this page request. If more labels are matching, this field contains the first one
    // in order from startUrls to crawlPurls, in order in which the labels appear in those arrays.
    // Note that labels are not mandatory, so the field might be null.
    'label',
    // The URL that was specified in the web page's navigation request,
    // possibly updated by the 'interceptRequest' function
    'url',
    // The final URL reported by the browser after the page was opened
    // (will be different from 'url' if there was a redirect)
    'loadedUrl',
    // A unique key under which this request can be found in the crawling queue,
    // by default it equals to URL stripped of the hashtag part (unless considerUrlFragment config setting was enabled),
    // it can also be modified by the 'interceptRequest' function
    'uniqueKey',
    // ID of the Request object from whose page this Request was first initiated, or null.
    'referrerId',
    // Contains the Request object corresponding to 'referrerId'.
    // This value is only available in pageFunction and interceptRequest functions
    // and can be used to access properties and page function results of pages linking to the current page.
    // Note that this object can also recursively define a 'referrer' property, which can also define a 'referrer' property, etc.
    // The depth of such a recursion is limited to 10 (see MAX_REFERRER_REQUEST_DEPTH constant).
    'referrer',
    // Date and time of the original web page's navigation request
    'requestedAt',
    // Date and time when the page load was initiated in the web browser, or null if it wasn't
    'loadingStartedAt',
    // Date and time when the page was actually loaded, or null if it wasn't
    'loadingFinishedAt',
    // HTTP status and headers of the loaded page.
    // If there were any redirects, the status and headers correspond to the finally loaded page, not the intermediate responses.
    'responseStatus',
    'responseHeaders',
    // Date and time when the page function started and finished
    'pageFunctionStartedAt',
    'pageFunctionFinishedAt',
    // Describes the type of the request. It can be either one of the following values:
    // 'InitialAboutBlank', 'StartUrl', 'SingleUrl', 'ActorRequest', 'OnUrlChanged', 'UserEnqueued', 'FoundLink'
    // or in case the request originates from PhantomJS' onNavigationRequested() it can be one of the following values:
    // 'Undefined', 'LinkClicked', 'FormSubmitted', 'BackOrForward', 'Reload', 'FormResubmitted', 'Other'
    // @TODO currtently we support only some of them
    'type',
    // How many links away from start URLs was this page found
    'depth',
    // Results of the user-provided 'pageFunction'
    'pageFunctionResult',
    // A field that might be used by 'interceptRequest' function to save custom data related to this page request
    'interceptRequestData',
    // Total size of all resources downloaded during this request
    'downloadedBytes',
    // Indicates whether the page will be loaded by the crawler or not
    'willLoad',
    // Indicates the position where the request will be placed in the crawling queue.
    // Can either be 'LAST' to put the request to the end of the queue (default behavior)
    // or 'FIRST' to put it before any other requests.
    'queuePosition',
    // If the page handling failed, this field will receive the error info.
    // do always append to this field and suffix your string with "\n".
    // an empty string means no error!
    'errorInfo',

    // @TODO these we have renamed to be without preceiding underscore dangle:
    // How many times page load was retried on error.
    'retryCount',
    // Indicates that the pageFunction requested not to save the request to JSON or database.
    'skipOutput',


    // additionally, there might be internal fields that are not saved to JSON or database, such as:
    // -- _crashesCount ... how many times PhantomJS crashed on this request, only used in src/worker/crawler_executor.js
    // -- _stats .......... only passed from executor to slave, contains current ActExecution.stats

    // If the page couldn't be loaded for any reason (e.g. on timeout), this field contains a best guess of
    // the code of the error. The value is either one of the codes from
    // http://doc.qt.io/qt-4.8/qnetworkreply.html#NetworkError-enum or value 999 for an unknown error.
    // This field is used internally to retry failed page loads.
    // 'loadErrorCode'

    // TODO: POST requests
    // Contains "GET" or "POST"
    // -- 'method',
    // HTTP POST data
    // -- 'postData',
    // Content-Type HTTP header of the POST request
    // -- 'contentType',
];

export default class Request {
    constructor(crawlerConfig, opts, copmuteDefaults = true) {
        this.data = {};

        PROPERTIES.forEach((key) => {
            if (!isNullOrUndefined(opts[key])) this[key] = opts[key];
            else if (!isNullOrUndefined(REQUEST_DEFAULTS[key])) this[key] = REQUEST_DEFAULTS[key];
            else this[key] = null;
        });

        if (copmuteDefaults) this.computeDefaults(crawlerConfig);
    }

    static fromJSON(crawlerConfig, json) {
        return new Request(crawlerConfig, json, false);
    }

    /**
     * This function computes the following Request fields: uniqueKey, willLoad and label,
     * and possibly matchesSearchArea/matchesTargetPage (for backwards compatibility).
     * Must be called before interceptRequest!
     */
    computeDefaults(crawlerConfig) {
        const url = this.url;

        // Depth is always refererrs depth + 1.
        if (this.referrer) this.depth = this.referrer.depth + 1;

        // Use uniqueKey provided by user in context.enqueuePage() or generate it from the URL.
        if (!this.uniqueKey) {
            this.uniqueKey = normalizeUrl(url, crawlerConfig.considerUrlFragment) || url || '';
        }

        // Start URL must be loaded always, even if it doesn't match any PURL or start URL
        // single URL must be loaded always too, e.g. user might want to test pageFunction on a new page
        // page was requested by user in the pageFunction(), so it will be loaded no matter what
        if (_.contains(ALWAYS_LOAD_FOR_TYPES, this.type)) this.willLoad = true;

        // If label is not defined, try to find the FIRST!!! matching crawlPurls to fill it from. (in specified order)
        crawlerConfig.crawlPurls.some((crawlPUrl) => {
            if (crawlPUrl.parsedPurl.matches(url)) {
                this.willLoad = true;
                this.label = crawlPUrl.key;

                return true;
            }
        });
    }

    /**
     * Called by JSON.stringify() when serializing this object, it returns result of this.explicitToJSON(false).
     *
     * NOTE: the reason why we need to have two functions toJSON() and explicitToJSON() is that
     *       JSON.stringify() passes some unknown arguments to toJSON(), which interfere with our
     *       'keepReferrers' argument.
     */
    toJSON() {
        return this.explicitToJSON(false);
    }

    /**
     * Returns a clone of this object that can be stringified to JSON.
     * If keepReferrers If true, the chain of referrers is preserved.
     * Otherwise, the 'referrer' property is not copied and it's replaced with 'referrerId' instead.
     */
    explicitToJSON(keepReferrers, depth = 0) {
        const copy = _.clone(this.data);
        const referrer = this.referrer;

        // Keep referrerId present even if keepReferrers, because referrers are kept only till a specific depth
        // and we want to have referrerId available even if 'referrer' is null, so this is consistent.
        copy.referrerId = referrer ? referrer.id : null;

        if (keepReferrers && depth < MAX_REFERRER_REQUEST_DEPTH) {
            copy.referrer = referrer ? referrer.explicitToJSON(keepReferrers, depth + 1) : null;
        } else {
            delete copy.referrer;
        }

        return copy;
    }

    /**
     * Prints a string like "{123:http://www.example.com}".
     */
    toString() {
        return `{${this.id}:${this.uniqueKey}}`;
    }
}

// Define getters and setters so that all the values gets saved under this.data.
PROPERTIES.forEach((key) => {
    Object.defineProperty(Request.prototype, key, {
        get() {
            return this.data[key];
        },
        set(val) {
            this.data[key] = val;
        },
    });
});
