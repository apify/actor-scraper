const Apify = require('apify');
const createBundle = require('../src/bundle.browser');

const NAMESPACE = 'Apify';

describe('Bundle', () => {
    let browser;
    let page;
    beforeAll(async () => {
        browser = await Apify.launchPuppeteer({ launchOptions: { headless: true } });
    });
    afterAll(async () => {
        await browser.close();
    });
    beforeEach(async () => {
        page = await browser.newPage();
        await page.evaluateOnNewDocument(createBundle, NAMESPACE);
    });
    afterEach(async () => {
        await page.close();
    });
    describe('Context', () => {
        const CONTEXT_OPTIONS = {
            crawlerSetup: {
                rawInput: '{}',

            },
            browserHandles: {
                apify: {},
                globalStore: {},
                log: {},
            },
            pageFunctionArguments: {
                request: {},
            },
        };
        beforeEach(async () => {
            await page.goto('about:chrome');
            await page.waitForFunction((namespace) => !!window[namespace], {}, NAMESPACE);
            await page.evaluate((namespace, contextOptions) => {
                window.contextInstance = window[namespace].createContext(contextOptions);
            }, NAMESPACE, CONTEXT_OPTIONS);
        });
        describe('waitFor', () => {
            it('should work with a number', async () => {
                const millis = await page.evaluate(async () => {
                    const ctx = window.contextInstance;
                    const start = Date.now();
                    await ctx.waitFor(10);
                    return Date.now() - start;
                });
                expect(millis).toBeGreaterThan(9);
            });
            it('should work with a selector', async () => {
                const millis = await page.evaluate(async () => {
                    const ctx = window.contextInstance;
                    const start = Date.now();
                    setTimeout(() => {
                        const el = document.createElement('div');
                        el.id = 'very-unique-id';
                        document.body.appendChild(el);
                    }, 10);
                    await ctx.waitFor('#very-unique-id');
                    return Date.now() - start;
                });
                expect(millis).toBeGreaterThan(9);
            });
            it('should work with a function', async () => {
                const millis = await page.evaluate(async () => {
                    const ctx = window.contextInstance;
                    let done = false;
                    const start = Date.now();
                    setTimeout(() => {
                        done = true;
                    }, 10);
                    await ctx.waitFor(() => done);
                    return Date.now() - start;
                });
                expect(millis).toBeGreaterThan(9);
            });
        });
    });
});
