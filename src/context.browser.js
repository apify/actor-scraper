/**
 * Node.js side command for Browser side code.
 * @param apifyNamespace
 */
module.exports = (apifyNamespace) => {
    (function (global, namespace) {
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
         * @param {Object} [options.pageFunctionArguments]
         */
        class Context {
            constructor(options) {
                const {
                    crawlerSetup,
                    browserHandles,
                    pageFunctionArguments = {},
                } = options;

                const createProxy = global[namespace].createNodeProxy;

                // Private
                this[setup] = crawlerSetup;
                this[state] = {
                    skipLinks: false,
                    skipOutput: false,
                    willFinishLater: false,
                };

                // Public
                this.input = crawlerSetup.rawInput;
                this.env = Object.assign({}, crawlerSetup.env);
                this.customData = crawlerSetup.customData;
                if (this[setup].injectJQuery) this.jQuery = global.jQuery.noConflict(true);
                if (this[setup].injectUnderscore) this.underscoreJs = global._.noConflict();

                // Proxied Node functionality
                this.globalStore = createProxy(browserHandles.globalStore);
                this.log = createProxy(browserHandles.log);
                this.finish = browserHandles.finish;
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

            willFinishLater() {
                this.log.debug('Marking page function as asynchronous. Crawler will wait for context.finish() function to be called.');
                this[state].willFinishLater = true;
            }

            enqueuePage(request) {
                if (!this[setup].useRequestQueue) {
                    throw new Error('Input parameter "useRequestQueue" must be set to true to be able to enqueue new requests.');
                }
                // Backwards compatibility hack to support Crawler codebase.
                if (request.label) {
                    if (request.userData && !request.userData.label) {
                        request.userData.label = request.label;
                    }
                    if (!request.userData) {
                        request.userData = {
                            label: request.label,
                        };
                    }
                }
                return this.requestQueue.addRequest(request);
            }
        }

        /**
         * Exposed factory.
         * @param {Object} options
         * @returns {Context}
         */
        global[namespace].createContext = (options) => {
            const context = new Context(options);
            return {
                context,
                state: context[state],
            };
        };
    }(window, apifyNamespace));
};
