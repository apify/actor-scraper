const Apify = require('apify');

const { utils: { log } } = Apify;

const setup = Symbol('crawler-setup');
const state = Symbol('request-state');

/**
 * Context represents everything that is available to the user
 * via Page Function. A class is used instead of a simple object
 * to avoid having to create new instances of functions with each
 * request.
 *
 * Some properties need to be accessible to the Context,
 * but should not be exposed to the user thus they are hidden
 * using a Symbol to prevent the user from easily accessing
 * and manipulating them.
 */
class Context {
    constructor(crawlerSetup, environment) {
        // Private
        this[setup] = crawlerSetup;
        this[state] = {
            finishPromise: null,
            finishResolve: null,
            skipLinks: false,
            skipOutput: false,
        };

        // Public
        this.customData = crawlerSetup.customData;
        this.requestList = crawlerSetup.requestList;
        this.requestQueue = crawlerSetup.requestQueue;
        this.dataset = crawlerSetup.dataset;
        this.keyValueStore = crawlerSetup.keyValueStore;
        this.input = crawlerSetup.rawInput;
        this.client = Apify.client;
        Object.assign(this, environment);
    }

    skipLinks() {
        log.debug('Skipping links.');
        this[state].skipLinks = true;
    }

    skipOutput() {
        log.debug('Skipping output.');
        this[state].skipOutput = true;
    }

    willFinishLater() {
        log.debug('context.willFinishLater() called');
        this[state].finishPromise = new Promise((resolve, reject) => {
            this[state].finishResolve = resolve;
            this[state].finishReject = reject;
        });
    }

    finish(err) {
        if (!this[state].finishResolve) {
            throw new Error('context.willFinishLater() must be called before context.finish()!');
        }
        log.debug('context.finish() called');
        if (err) this[state].finishReject(err);
        else this[state].finishResolve();
    }
    enqueuePage(newRequest) {
        if (!this[setup].useRequestQueue) {
            throw new Error('Input parameter "useRequestQueue" must be set to true to be able to enqueue new requests.');
        }
        return this.requestQueue.addRequest(newRequest);
    }
}

/**
 * Creates a Context by passing all arguments to its constructor
 * and returns it, along with a reference to its state object.
 *
 * @param {CrawlerSetup} crawlerSetup
 * @param {Object} environment
 * @returns {{{context: Context, state: Object}}}
 */
exports.getContextAndState = (crawlerSetup, environment) => {
    const context = new Context(crawlerSetup, environment);
    return {
        context,
        state: context[state],
    };
};
