/**
 * Command to be evaluated for Browser side code injection.
 * @param apifyNamespace
 */
module.exports = (apifyNamespace) => {
    (function (global, namespace) {
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
        global[namespace].createNodeProxy = config => new NodeProxy(config);
    }(window, apifyNamespace));
};
