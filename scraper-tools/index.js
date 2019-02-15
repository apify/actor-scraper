const constants = require('./src/consts');
const tools = require('./src/tools');
const browserTools = require('./src/browser_tools');
const GlobalStore = require('./src/global_store');

const attachContext = require('./src/context.browser');
const attachNodeProxy = require('./src/node_proxy.browser');

module.exports = {
    browser: {
        attachContext,
        attachNodeProxy,
    },
    constants,
    GlobalStore,
    tools,
    browserTools,
};
