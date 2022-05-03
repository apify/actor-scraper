/* eslint-disable max-classes-per-file */
/* istanbul ignore next */
/**
 * Command to be evaluated for Browser side code injection.
 * @param apifyNamespace
 */
module.exports = (apifyNamespace) => {
    (function (global, namespace) {
        if (typeof window[namespace] !== 'object') window[namespace] = {};
        /**
         * Takes a configuration object with function references
         * as an input and creates a dummy class that proxies
         * function invocations from Browser context to Node context.
         *
         * The configuration is to be provided by the
         * tools.createBrowserHandlesForObject function.
         */
        class NodeProxy {
            constructor(config) {
                if (!config || typeof config !== 'object') {
                    throw new Error('NodeProxy: Parameter config of type Object must be provided.');
                }

                Object.entries(config)
                    .forEach(([key, { value, type }]) => {
                        if (type === 'METHOD') {
                            this[key] = (...args) => global[value](...args);
                        } else if (type === 'GETTER') {
                            Object.defineProperty(this, key, {
                                get: () => global[value](),
                            });
                        } else if (type === 'VALUE') {
                            this[key] = value;
                        } else {
                            throw new Error(`Unsupported function type: ${type} for function: ${key}.`);
                        }
                    });
            }
        }

        /**
         * Exposed factory.
         * @param config
         * @return {NodeProxy}
         */
        global[namespace].createNodeProxy = (config) => new NodeProxy(config);

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
                    keyValueStore: browserHandles.keyValueStore ? createProxy(browserHandles.keyValueStore) : null,
                };

                // Copies of Node objects
                this.input = JSON.parse(crawlerSetup.rawInput);
                this.env = { ...crawlerSetup.env };
                this.customData = crawlerSetup.customData;
                this.response = pageFunctionArguments.response;
                this.request = pageFunctionArguments.request;
                // Functions are not converted so we need to add them this way
                // to not be enumerable and thus not polluting the object.
                Reflect.defineProperty(this.request, 'pushErrorMessage', {
                    value(errorOrMessage) {
                        // It's a simplified fake of the original function.
                        const msg = (errorOrMessage && errorOrMessage.message) || `${errorOrMessage}`;
                        this.errorMessages.push(msg);
                    },
                    enumerable: false,
                });

                // Proxied Node objects
                this.globalStore = createProxy(browserHandles.globalStore);
                this.log = createProxy(browserHandles.log);

                // Browser side libraries
                if (this[setup].injectJQuery) this.jQuery = global.jQuery.noConflict(true);
                if (this[setup].injectUnderscore) this.underscoreJs = global._.noConflict();

                // Bind this to allow destructuring off context in pageFunction.
                this.getValue = this.getValue.bind(this);
                this.setValue = this.setValue.bind(this);
                this.saveSnapshot = this.saveSnapshot.bind(this);
                this.skipLinks = this.skipLinks.bind(this);
                this.enqueueRequest = this.enqueueRequest.bind(this);
                this.waitFor = this.waitFor.bind(this);
            }

            async getValue(...args) {
                return this[internalState].keyValueStore.getValue(...args);
            }

            async setValue(...args) {
                return this[internalState].keyValueStore.setValue(...args);
            }

            async saveSnapshot() {
                const handle = this[internalState].browserHandles.saveSnapshot;
                return global[handle]();
            }

            async skipLinks() {
                const handle = this[internalState].browserHandles.skipLinks;
                return global[handle]();
            }

            async enqueueRequest(requestOpts = {}, options = {}) {
                const defaultRequestOpts = {
                    useExtendedUniqueKey: true,
                    keepUrlFragment: this.input.keepUrlFragments,
                };

                const newRequest = { ...defaultRequestOpts, ...requestOpts };

                const metaKey = this[setup].META_KEY;
                const defaultUserData = {
                    [metaKey]: {
                        parentRequestId: this.request.id || this.request.uniqueKey,
                        depth: this.request.userData[metaKey].depth + 1,
                    },
                };

                newRequest.userData = { ...defaultUserData, ...requestOpts.userData };

                return this[internalState].requestQueue.addRequest(newRequest, options);
            }

            async waitFor(selectorOrNumberOrFunction, options = {}) {
                if (!options || typeof options !== 'object') throw new Error('Parameter options must be an Object');
                const type = typeof selectorOrNumberOrFunction;
                if (type === 'string') return this._waitForSelector(selectorOrNumberOrFunction, options);
                if (type === 'number') return this._waitForMillis(selectorOrNumberOrFunction);
                if (type === 'function') return this._waitForFunction(selectorOrNumberOrFunction, options);
                throw new Error('Parameter selectorOrNumberOrFunction must be one of the said types.');
            }

            async _waitForSelector(selector, options = {}) {
                try {
                    await this._poll(() => {
                        return !!global.document.querySelector(selector);
                    }, options);
                } catch (err) {
                    if (/timeout of \d+ms exceeded/.test(err.message)) {
                        throw new Error(`Timeout Error: waiting for selector failed: ${err.message}`);
                    }
                    throw err;
                }
            }

            async _waitForMillis(millis) {
                return new Promise((res) => setTimeout(res, millis));
            }

            async _waitForFunction(predicate, options = {}) {
                try {
                    await this._poll(predicate, options);
                } catch (err) {
                    if (/timeout of \d+ms exceeded/.test(err.message)) {
                        throw new Error(`Timeout Error: waiting for function failed: ${err.message}`);
                    }
                    throw err;
                }
            }

            async _poll(predicate, options = {}) {
                const {
                    pollingIntervalMillis = 50,
                    timeoutMillis = 20000,
                } = options;
                return new Promise((resolve, reject) => {
                    const handler = () => {
                        return predicate() ? resolve() : setTimeout(handler);
                    };
                    const pollTimeout = setTimeout(handler, pollingIntervalMillis);
                    setTimeout(() => {
                        clearTimeout(pollTimeout);
                        return reject(new Error(`timeout of ${timeoutMillis}ms exceeded.`));
                    }, timeoutMillis);
                });
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
