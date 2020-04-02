const Apify = require('apify');
const retry = require('async-retry');
const { promisifyServerListen } = require('apify-shared/utilities');
const http = require('http');
const httpProxy = require('http-proxy');
const { CHROME_DEBUGGER_PORT } = require('../consts');
const { renderHomePage } = require('./home-page');

const { utils: { log } } = Apify;

const MAX_SERVER_RESTARTS = 5;

/**
 * Starts a server on the specified port that serves a very simple
 * page with devtools frontend embedded in an iFrame on the root path
 * and proxies all other paths and websocket to the debugged browser.
 *
 * There are two main reasons for this. First, it allows skipping the
 * page selection screen and go directly to debugging. Second, it
 * enables additional UI features that are needed to control the
 * debugging process, such as refreshing page to load a new tab.
 *
 * @param {number} port
 * @return {Promise<Server>}
 */
exports.startDebuggerServer = async (port, restarts = 0) => {
    const proxy = httpProxy.createProxyServer({
        target: {
            host: 'localhost',
            port: CHROME_DEBUGGER_PORT,
        },
    });

    proxy.on('proxyReq', (proxyReq) => {
        // We need Chrome to think that it's on localhost otherwise it throws an error...
        proxyReq.setHeader('Host', 'localhost');
    });

    proxy.on('error', (err) => {
        log.exception(err, 'Debugger proxy error:');
    });

    const server = http.createServer(async (req, res) => {
        if (req.url === '/') {
            try {
                const debuggerUrl = await createDebuggerUrl();
                res.writeHead(200);
                res.end(renderHomePage(debuggerUrl));
            } catch (err) {
                res.writeHead(500);
                res.end(`Error: ${err.message}`);
            }
        } else {
            proxy.web(req, res);
        }
    });
    server.on('upgrade', (req, socket, head) => {
        proxy.ws(req, socket, head);
    });
    server.on('error', (err) => {
        log.exception(err, 'Debugger server failed and will be restarted.');
        server.close(async () => {
            if (restarts < MAX_SERVER_RESTARTS) {
                await exports.startDebuggerServer(port, restarts + 1);
            }
        });
    });
    log.info('Starting a debugger server.');
    await promisifyServerListen(server)(port);
    log.info(`Debugger server listening on port: ${port}`);
};

function parseVersionHash(versionData) {
    const version = versionData['WebKit-Version'];
    return version.match(/\s\(@(\b[0-9a-f]{5,40}\b)/)[1];
}

async function createDebuggerUrl() {
    const [hash, devtoolsUrl] = await retry(fetchHashAndDevtoolsUrl, { retries: 5 });

    const containerHost = new URL(process.env.APIFY_CONTAINER_URL).host;
    const correctDevtoolsUrl = devtoolsUrl.replace(`ws=localhost:${CHROME_DEBUGGER_PORT}`, `wss=${containerHost}`);
    return `https://chrome-devtools-frontend.appspot.com/serve_file/@${hash}/${correctDevtoolsUrl}&remoteFrontend=true`;
}

async function fetchHashAndDevtoolsUrl() {
    const [list, version] = await Promise.all([
        fetchDebuggerInfo('list'),
        fetchDebuggerInfo('version'),
    ]);
    const hash = parseVersionHash(version);
    const devtoolsFrontendUrl = findPageUrl(list);
    if (!devtoolsFrontendUrl) throw Error('Page not ready yet.');
    return [hash, devtoolsFrontendUrl];
}

async function fetchDebuggerInfo(resource) {
    const { body } = await Apify.utils.requestAsBrowser({
        url: `http://localhost:${CHROME_DEBUGGER_PORT}/json/${resource}`,
        json: true,
    });
    return body;
}

function findPageUrl(list) {
    const page = list.find(p => p.type === 'page' && p.url !== 'about:blank');
    return page && page.devtoolsFrontendUrl.replace(/^\/devtools\//, '');
}
