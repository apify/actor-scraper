/**
 * Command to be evaluated for Browser side code injection.
 * @param apifyNamespace
 */
module.exports = (apifyNamespace) => {
    (function (global, namespace) {
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
         * @param {Object} options.browserHandles
         * @param {Object} options.pageFunctionArguments
         */
        class Context {
            constructor(options) {
                const {
                    crawlerSetup,
                    browserHandles,
                    pageFunctionArguments,
                } = options;

                const createProxy = global[namespace].createNodeProxy;

                // Private
                this[setup] = crawlerSetup;
                this[internalState] = {
                    browserHandles,
                    requestQueue: browserHandles.requestQueue ? createProxy(browserHandles.requestQueue) : null,
                    apify: createProxy(browserHandles.apify),
                };

                // Copies of Node objects
                this.input = JSON.parse(crawlerSetup.rawInput);
                this.env = Object.assign({}, crawlerSetup.env);
                this.customData = crawlerSetup.customData;
                this.response = pageFunctionArguments.response;
                this.request = pageFunctionArguments.request;
                // Functions are not converted so we need to add this one
                Reflect.defineProperty(this.request, 'doNotRetry', {
                    value(message) {
                        // this refers to request instance!
                        this.noRetry = true;
                        if (message) throw new Error(message);
                    },
                    enumerable: false,
                });

                // Proxied Node objects
                this.globalStore = createProxy(browserHandles.globalStore);
                this.log = createProxy(browserHandles.log);

                // Browser side libraries
                if (this[setup].injectJQuery) this.jQuery = global.jQuery.noConflict(true);
                if (this[setup].injectUnderscore) this.underscoreJs = global._.noConflict();
            }

            async getValue(...args) {
                return this[internalState].apify.getValue(...args);
            }

            async setValue(...args) {
                return this[internalState].apify.setValue(...args);
            }

            async saveSnapshot() {
                const handle = this[internalState].browserHandles.saveSnapshot;
                return global[handle]();
            }

            async skipLinks() {
                const handle = this[internalState].browserHandles.skipLinks;
                return global[handle]();
            }

            async enqueueRequest(request, options) {
                if (!this[setup].useRequestQueue) {
                    throw new Error('Input parameter "useRequestQueue" must be set to true to be able to enqueue new requests.');
                }
                return this[internalState].requestQueue.addRequest(request, options);
            }
        }

        /**
         * Exposed factory.
         * @param {Object} options
         * @returns {Context}
         */
        global[namespace].createContext = (options) => {
            return new Context(options);
        };
    }(window, apifyNamespace));
};
