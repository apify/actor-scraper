const Apify = require('apify');
const browserTools = require('./browser_tools');

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
    constructor(crawlerSetup, pageFunctionArguments) {
        // Private
        this[setup] = crawlerSetup;
        this[state] = {
            skipLinks: false,
            skipOutput: false,
        };

        // Public
        this.input = crawlerSetup.rawInput;
        this.env = Object.assign({}, crawlerSetup.env);
        this.customData = crawlerSetup.customData;

        this.saveSnapshot = () => browserTools.saveSnapshot(pageFunctionArguments.page);
        this.log = log;
        this.globalStore = crawlerSetup.globalStore;
        this.requestList = crawlerSetup.requestList;
        this.requestQueue = crawlerSetup.requestQueue;
        this.dataset = crawlerSetup.dataset;
        this.keyValueStore = crawlerSetup.keyValueStore;
        this.client = Apify.client;
        this.Apify = Apify;

        Object.assign(this, pageFunctionArguments);
    }

    skipLinks() {
        log.debug('Skipping links.');
        this[state].skipLinks = true;
    }

    skipOutput() {
        log.debug('Skipping output.');
        this[state].skipOutput = true;
    }

    enqueuePage(newRequest) {
        if (!this[setup].input.useRequestQueue) {
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
 * @param {Object} pageFunctionArguments
 * @returns {{{context: Context, state: Object}}}
 */
exports.createContext = (crawlerSetup, pageFunctionArguments) => {
    const context = new Context(crawlerSetup, pageFunctionArguments);
    return {
        context,
        state: context[state],
    };
};
