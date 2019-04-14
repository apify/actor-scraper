const Apify = require('apify');
const browserTools = require('./browser_tools');

const setup = Symbol('crawler-setup');
const internalState = Symbol('request-internal-state');

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
 *
 * @param {Object} options
 * @param {Object} options.crawlerSetup
 * @param {Object} options.pageFunctionArguments
 */
class Context {
    /* eslint-disable class-methods-use-this */
    constructor(options) {
        const {
            crawlerSetup,
            pageFunctionArguments,
        } = options;

        // Private
        this[setup] = crawlerSetup;
        this[internalState] = {
            skipLinks: false,
        };

        this.Apify = Apify;
        this.input = JSON.parse(crawlerSetup.rawInput);
        this.env = Object.assign({}, crawlerSetup.env);
        this.customData = crawlerSetup.customData;
        this.globalStore = crawlerSetup.globalStore;
        this.log = Apify.utils.log;

        this.request = pageFunctionArguments.request;
        this.response = pageFunctionArguments.response;
        this.autoscaledPool = pageFunctionArguments.autoscaledPool;

        // When using PuppeteerCrawler
        if (pageFunctionArguments.page) {
            this.page = pageFunctionArguments.page;
            this.puppeteerPool = pageFunctionArguments.puppeteerPool;
        }

        // When using CheerioCrawler
        if (pageFunctionArguments.$) this.$ = pageFunctionArguments.$;

        // Bind this to allow destructuring off context in pageFunction.
        this.saveSnapshot = this.saveSnapshot.bind(this);
        this.skipLinks = this.skipLinks.bind(this);
        this.enqueueRequest = this.enqueueRequest.bind(this);
    }

    async getValue(...args) {
        return Apify.getValue(...args);
    }

    async setValue(...args) {
        return Apify.setValue(...args);
    }

    async saveSnapshot() {
        return browserTools.saveSnapshot({
            page: this.page,
            $: this.$,
        });
    }

    async skipLinks() {
        this[internalState].skipLinks = true;
    }

    async enqueueRequest(request, options = {}) {
        if (!this[setup].useRequestQueue) {
            throw new Error('Input parameter "useRequestQueue" must be set to true to be able to enqueue new requests.');
        }
        return this[setup].requestQueue.addRequest(request, options);
    }
}

/**
 * Creates a Context by passing all arguments to its constructor
 * and returns it, along with a reference to its state object.
 *
 * @param {Object} contextOptions
 * @returns {{{context: Context, state: Object}}}
 */
exports.createContext = (contextOptions) => {
    const context = new Context(contextOptions);
    return {
        context,
        state: context[internalState],
    };
};
