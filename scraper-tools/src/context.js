const Apify = require('apify');
const contentTypeParser = require('content-type');
const browserTools = require('./browser_tools');
const { META_KEY } = require('./consts');

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
        this.env = { ...crawlerSetup.env };
        this.customData = crawlerSetup.customData;
        this.globalStore = crawlerSetup.globalStore;
        this.log = Apify.utils.log;

        // Page function arguments are directly passed from CrawlerSetup
        // and differ between Puppeteer and Cheerio Scrapers.
        // We must use properties and descriptors not to trigger getters / setters.
        Object.defineProperties(this, Object.getOwnPropertyDescriptors(pageFunctionArguments));

        // Bind this to allow destructuring off context in pageFunction.
        this.saveSnapshot = this.saveSnapshot.bind(this);
        this.skipLinks = this.skipLinks.bind(this);
        this.enqueueRequest = this.enqueueRequest.bind(this);
    }

    async getValue(...args) {
        return this[setup].keyValueStore.getValue(...args);
    }

    async setValue(...args) {
        return this[setup].keyValueStore.setValue(...args);
    }

    async saveSnapshot() {
        return browserTools.saveSnapshot({
            page: this.page,
            body: this.body,
            contentType: this.contentType
                ? contentTypeParser.format(this.contentType)
                : null,
            json: this.json,
        });
    }

    async skipLinks() {
        this[internalState].skipLinks = true;
    }

    async enqueueRequest(requestOpts = {}, options = {}) {
        const defaultRequestOpts = {
            useExtendedUniqueKey: true,
            keepUrlFragment: this.input.keepUrlFragments,
        };

        const newRequest = { ...defaultRequestOpts, ...requestOpts };

        const defaultUserData = {
            [META_KEY]: {
                parentRequestId: this.request.id || this.request.uniqueKey,
                depth: this.request.userData[META_KEY].depth + 1,
            },
        };

        newRequest.userData = { ...defaultUserData, ...requestOpts.userData };

        return this[setup].requestQueue.addRequest(newRequest, options);
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
