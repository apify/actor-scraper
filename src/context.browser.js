(function (global) {
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
     *
     * @param {Object} options
     * @param {Object} options.crawlerSetup
     * @param {Object} options.browserHandles
     * @param {Object} options.pageFunctionArguments
     */
    class Context {
        constructor(options) {
            const {
                crawlerSetup,
                browserHandles,
                pageFunctionArguments = {},
            } = options;

            const createProxy = global.Apify.createNodeProxy;

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

            // Proxied Node functionality
            this.log = createProxy(browserHandles.log);
            this.requestList = createProxy(browserHandles.requestList);
            this.dataset = createProxy(browserHandles.dataset);
            this.keyValueStore = createProxy(browserHandles.keyValueStore);
            if (browserHandles.requestQueue) this.requestQueue = createProxy(browserHandles.requestQueue);

            Object.assign(this, pageFunctionArguments);
        }

        skipLinks() {
            this.log.debug('Skipping links.');
            this[state].skipLinks = true;
        }

        skipOutput() {
            this.log.debug('Skipping output.');
            this[state].skipOutput = true;
        }

        enqueuePage(newRequest) {
            if (!this[setup].useRequestQueue) {
                throw new Error('Input parameter "useRequestQueue" must be set to true to be able to enqueue new requests.');
            }
            return this.requestQueue.addRequest(newRequest);
        }
    }

    /**
     * Exposed factory.
     * @param {Object} options
     * @returns {Context}
     */
    global.Apify.createContext = (options) => {
        const context = new Context(options);
        return {
            context,
            state: context[state],
        };
    };
}(window));
