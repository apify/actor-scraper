const constants = require('./src/consts');
const tools = require('./src/tools');
const browserTools = require('./src/browser_tools');
const GlobalStore = require('./src/global_store');

const { createContext } = require('./src/context');
const attachContext = require('./src/context.browser');
const attachNodeProxy = require('./src/node_proxy.browser');

module.exports = {
    browser: {
        attachContext,
        attachNodeProxy,
    },
    constants,
    createContext,
    GlobalStore,
    tools,
    browserTools,
};
