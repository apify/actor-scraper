/**
 * This module defines the Request class which represents a single web page request.
 */

import _ from 'underscore';
import { normalizeUrl } from './utils';

const MAX_REFERRER_REQUEST_DEPTH = 3;

const PROPERTIES = [
    'id',
    'label',
    'url',
    'uniqueKey',
    'referrer',
];

// @TODO add validation for parameters.
export default class Request {
    constructor(crawlerConfig, { label, url }) {
        this.data = {
            label,
            url,
        };

        this.computeStuff(crawlerConfig);

        PROPERTIES.forEach((key) => {
            Object.defineProperty(this, key, {
                get: () => this.data[key],
                set: (val) => {
                    this.data[key] = val;
                },
            });
        });

        // An auto-incremented ID
        // this.id = null;

        // The URL that was specified in the web page's navigation request,
        // possibly updated by the 'interceptRequest' function
        // this.url = null;

        // The final URL reported by the browser after the page was opened
        // (will be different from 'url' if there was a redirect)
        // this.loadedUrl = null;

        // Date and time of the original web page's navigation request
        // this.requestedAt = null;
        // Date and time when the page load was initiated in the web browser, or null if it wasn't
        // this.loadingStartedAt = null;
        // Date and time when the page was actually loaded, or null if it wasn't
        // this.loadingFinishedAt = null;

        // HTTP status and headers of the loaded page.
        // If there were any redirects, the status and headers correspond to the finally loaded page, not the intermediate responses.
        // this.responseStatus = null;
        // this.responseHeaders = null;

        // If the page couldn't be loaded for any reason (e.g. on timeout), this field contains a best guess of
        // the code of the error. The value is either one of the codes from
        // http://doc.qt.io/qt-4.8/qnetworkreply.html#NetworkError-enum or value 999 for an unknown error.
        // This field is used internally to retry failed page loads.
        // this.loadErrorCode = null;

        // Date and time when the page function started and finished
        // this.pageFunctionStartedAt = null;
        // this.pageFunctionFinishedAt = null;

        // A unique key under which this request can be found in the crawling queue,
        // by default it equals to URL stripped of the hashtag part (unless considerUrlFragment config setting was enabled),
        // it can also be modified by the 'interceptRequest' function
        // this.uniqueKey = null;

        // Describes the type of the request. It can be either one of the following values:
        // 'InitialAboutBlank', 'StartUrl', 'SingleUrl', 'ActorRequest', 'OnUrlChanged', 'UserEnqueued', 'FoundLink'
        // or in case the request originates from PhantomJS' onNavigationRequested() it can be one of the following values:
        // 'Undefined', 'LinkClicked', 'FormSubmitted', 'BackOrForward', 'Reload', 'FormResubmitted', 'Other'
        // this.type = null;

        // Boolean value indicating whether the page was opened in a main frame or a child frame
        // this.isMainFrame = null;

        // HTTP POST data
        // this.postData = null;

        // Content-Type HTTP header of the POST request
        // this.contentType = null;

        // Contains "GET" or "POST"
        // this.method = null;

        // Indicates whether the page will be loaded by the crawler or not
        // this.willLoad = null;

        // Indicates the label specified in startUrls or crawlPurls config settings where URL/PURL corresponds
        // to this page request. If more labels are matching, this field contains the first one
        // in order from startUrls to crawlPurls, in order in which the labels appear in those arrays.
        // Note that labels are not mandatory, so the field might be null.
        // this.label = null;

        // ID of the Request object from whose page this Request was first initiated, or null.
        // this.referrerId = null;

        // Contains the Request object corresponding to 'referrerId'.
        // This value is only available in pageFunction and interceptRequest functions
        // and can be used to access properties and page function results of pages linking to the current page.
        // Note that this object can also recursively define a 'referrer' property, which can also define a 'referrer' property, etc.
        // The depth of such a recursion is limited to 10 (see MAX_REFERRER_REQUEST_DEPTH constant).
        // this.referrer = null;

        // How many links away from start URLs was this page found
        // this.depth = null;

        // If the page handling failed, this field will receive the error info.
        // do always append to this field and suffix your string with "\n".
        // an empty string means no error!
        // this.errorInfo = '';

        // Results of the user-provided 'pageFunction'
        // this.pageFunctionResult = null;

        // A field that might be used by 'interceptRequest' function to save custom data related to this page request
        // TODO: will this be propagated from second request for the same page???
        // this.interceptRequestData = null;

        // Total size of all resources downloaded during this request
        // this.downloadedBytes = 0;

        // Indicates the position where the request will be placed in the crawling queue.
        // Can either be 'LAST' to put the request to the end of the queue (default behavior)
        // or 'FIRST' to put it before any other requests.
        // TODO: 'RANDOM' for random position (TODO: not yet implemented)
        // this.queuePosition = 'LAST';

        // additionally, there might be internal fields that are not saved to JSON or database, such as:
        // _skipOutput ..... indicates that the pageFunction requested not to save the request to JSON or database
        // _crashesCount ... how many times PhantomJS crashed on this request, only used in src/worker/crawler_executor.js
        // _retryCount ..... how many times page load was retried on error
        // _stats .......... only passed from executor to slave, contains current ActExecution.stats
        // TODO: ... more than this
    }

    /**
     * This function computes the following Request fields: uniqueKey, willLoad and label,
     * and possibly matchesSearchArea/matchesTargetPage (for backwards compatibility).
     * Must be called before interceptRequest!
     */
    computeStuff(crawlerConfig) {
        const url = this.data.url;

        // Use uniqueKey provided by user in context.enqueuePage() or generate it from the URL.
        if (!this.data.uniqueKey) {
            this.data.uniqueKey = normalizeUrl(url, crawlerConfig.considerUrlFragment) || url || '';
        }

        // this.willLoad = false;
        // this.label = label;

        // * start URL must be loaded always, even if it doesn't match any PURL or start URL
        // * single URL must be loaded always too, e.g. user might want to test pageFunction on a new page
        // * page was requested by user in the pageFunction(), so it will be loaded no matter what
        // if (this.type === 'StartUrl'
        //     || this.type === 'SingleUrl'
        //     || this.type === 'UserEnqueued') { this.willLoad = true; }

        // if label is not defined, try to find the FIRST!!! matching crawlPurls to fill it from (in specified order)
        // for (var i = 0; i < c.crawlPurls.length && utils.isEmpty(this.label); i++) {
        //     if (c.crawlPurls[i].parsedPurl.matches(url)) {
        //         this.willLoad = true;
        //         this.label = c.crawlPurls[i].label;
        //     }
        // }

        // BACKWARD COMPATIBILITY: check whether URL matches the search area or a target page PURLs
        // if (c.searchAreaPurlsParsed.length !== 0 || c.targetPagePurlsParsed.length !== 0) {
        //    this.matchesSearchArea = false;
        //    this.matchesTargetPage = false;
        //    for (var i = 0; i < c.searchAreaPurlsParsed.length; i++) { this.matchesSearchArea = this.matchesSearchArea || c.searchAreaPurlsParsed[i].matches(url); }
        //    for (var i = 0; i < c.targetPagePurlsParsed.length; i++) { this.matchesTargetPage = this.matchesTargetPage || c.targetPagePurlsParsed[i].matches(url); }
        //    if (this.matchesSearchArea || this.matchesTargetPage) { this.willLoad = true; }
        // }
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
        const copy = _.mapObject(this.data, val => val);
        const referrer = this.data.referrer;

        // Keep referrerId present even if keepReferrers, because referrers are kept only till a specific depth
        // and we want to have referrerId available even if 'referrer' is null, so this is consistent.
        copy.referrerId = referrer ? referrer.data.id : null;

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
        return `{${this.data.id}:${this.data.uniqueKey}}`;
    }
}
