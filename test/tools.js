const fs = require('fs-extra');
const path = require('path');
const Apify = require('apify');
const { expect } = require('chai');
const sinon = require('sinon');
const _ = require('underscore');

const tools = require('../src/tools');
const { META_KEY } = require('../src/consts');

const { utils: { log } } = Apify;

const LOCAL_STORAGE_DIR = path.join(__dirname, 'tmp');

const PAGE_CONTENT = `
<html>
    <head>
        <title>Example</title>
    </head>
    <body>
        <p>
            The ships hung in the sky, much the <a class="click" href="https://example.com/a/b/first">way that</a> bricks don't.
        </p>
        <ul>
            <li>These aren't the Droids you're looking for</li>
            <li><a href="https://example.com/a/second">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
            <li><a class="click" href="https://example.com/a/b/third">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
        </ul>
        <a class="click" href="https://another.com/a/fifth">The Greatest Science Fiction Quotes Of All Time</a>
        <p>
            Don't know, I don't know such stuff. I just do eyes, ju-, ju-, just eyes... just genetic design,
            just eyes. You Nexus, huh? I design your <a class="click" href="http://cool.com/">eyes</a>.
        </p>
    </body>
</html>`;

describe('Tools using Puppeteer:', () => {
    let browser;
    before(async () => {
        fs.ensureDirSync(LOCAL_STORAGE_DIR);
        process.env.APIFY_LOCAL_STORAGE_DIR = LOCAL_STORAGE_DIR;
        browser = await Apify.launchPuppeteer({ headless: true });
    });
    after(async () => {
        fs.removeSync(LOCAL_STORAGE_DIR);
        delete process.env.APIFY_LOCAL_STORAGE_DIR;
        await browser.close();
    });

    describe('tools.enqueueLinks()', () => {
        it('should work', async () => {
            const page = await browser.newPage();
            await page.setContent(PAGE_CONTENT);
            const linkSelector = 'a';
            const pseudoUrls = [
                { purl: 'https://example.com[.*]' },
            ];
            let id = 0;
            const requestQueue = await Apify.openRequestQueue();
            requestQueue.requests = [];
            requestQueue.addRequest = function (request) {
                requestQueue.requests.push(request);
                return { requestId: `some-${++id}` };
            };

            const request = new Apify.Request({ id: 'parent', url: 'https://www.example.com' });
            tools.ensureMetaData(request);

            await tools.enqueueLinks(page, linkSelector, pseudoUrls, requestQueue, request);

            expect(requestQueue.requests).to.have.lengthOf(3);
            requestQueue.requests.forEach((r) => {
                expect(r.userData[META_KEY].depth).to.be.eql(1);
                expect(r.userData[META_KEY].parentRequestId).to.be.eql('parent');
                expect(r.userData[META_KEY].childRequestIds).to.be.eql({});
            });
            const children = Object.keys(request.userData[META_KEY].childRequestIds);
            expect(children).to.have.lengthOf(3);
            children.forEach(c => expect(/^some-[123]$/.test(c)).to.be.eql(true));
        });
    });

    describe('tools.createBrowserHandle()', () => {
        it('should work', async () => {
            const page = await browser.newPage();
            const handle = await tools.createBrowserHandle(page, () => 42);
            const result = await page.evaluate(browserHandle => window[browserHandle](), handle);
            expect(result).to.be.eql(42);
        });
    });

    describe('tools.createBrowserHandlesForObject', () => {
        it('should work', async () => {
            const page = await browser.newPage();

            const instance = await Apify.openKeyValueStore();
            const methods = ['getValue', 'setValue'];

            const handlesMap = await tools.createBrowserHandlesForObject(page, instance, methods);

            expect(handlesMap.getValue).to.be.a('string');
            expect(handlesMap.setValue).to.be.a('string');
            expect(handlesMap.setValue).not.to.be.eql(handlesMap.getValue);

            await page.evaluate(async (setValueHandle) => {
                await window[setValueHandle]('123', 'hello', { contentType: 'text/plain' });
            }, handlesMap.setValue);
            const value = await instance.getValue('123');
            expect(value).to.be.eql('hello');

            await instance.setValue('321', 'bye', { contentType: 'text/plain' });
            const valueFromBrowser = await page.evaluate(async (getValueHandle) => {
                return window[getValueHandle]('321');
            }, handlesMap.getValue);
            expect(valueFromBrowser).to.be.eql('bye');

            const nodeContext = {
                one: await instance.getValue('123'),
                three: await instance.getValue('321'),
            };

            const browserContext = await page.evaluate(async (gvh) => {
                return {
                    one: await window[gvh]('123'),
                    three: await window[gvh]('321'),
                };
            }, handlesMap.getValue);

            expect(nodeContext).to.be.eql(browserContext);
        });
    });

    describe('tools.dumpConsole()', () => {
        afterEach(() => {
            sinon.restore();
        });

        it('should work', async () => {
            let page = await browser.newPage();

            const debug = sinon.spy(log, 'debug');
            const info = sinon.spy(log, 'info');
            const warning = sinon.spy(log, 'warning');
            const error = sinon.spy(log, 'error');

            tools.dumpConsole(page);
            await page.evaluate(async () => {
                /* eslint-disable no-console */
                console.log('info');
                console.warn('warning');
                console.info('info');
                console.dir('info');
                console.error('error');
                console.debug('debug');

                await new Promise(r => setTimeout(r, 10));
            });

            expect(debug.withArgs('debug').calledOnce).to.be.eql(true);
            expect(info.withArgs('info').calledThrice).to.be.eql(true);
            expect(warning.withArgs('warning').calledOnce).to.be.eql(true);
            expect(error.withArgs('error').called).to.be.eql(false);

            page = await browser.newPage();
            tools.dumpConsole(page, { logErrors: true });
            await page.evaluate(async () => {
                /* eslint-disable no-console */
                console.error('error');
                await new Promise(r => setTimeout(r, 10));
            });

            expect(error.withArgs('error').calledOnce).to.be.eql(true);

            await browser.close();
        });
    });
});

describe('Tools - Other:', () => {
    describe('tools.ensureMetaData()', () => {
        it('should work', () => {
            const request = new Apify.Request({ url: 'https://www.example.com' });
            tools.ensureMetaData(request);

            expect(request.userData[META_KEY]).to.be.an('object');
            const meta = request.userData[META_KEY];
            expect(meta.depth).to.be.eql(0);
            expect(meta.parentRequestId).to.be.eql(null);
            expect(meta.childRequestIds).to.be.eql({});
        });
    });
});
