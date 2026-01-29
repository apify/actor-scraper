import { launchPuppeteer } from '@crawlee/puppeteer';
import type { Browser, Page } from 'puppeteer';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { createBundle } from '../src/internals/bundle.browser';

const NAMESPACE = 'Apify';

describe('Bundle', () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        browser = await launchPuppeteer({ launchOptions: { headless: true } });
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
            await page.waitForFunction(
                (namespace: string) => !!window[namespace],
                {},
                NAMESPACE,
            );
            await page.evaluate(
                (namespace: string, contextOptions) => {
                    window.contextInstance =
                        window[namespace].createContext(contextOptions);
                },
                NAMESPACE,
                CONTEXT_OPTIONS,
            );
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

    describe('DevToolsServer (regression)', () => {
        it('starts only once even if preLaunchHook calls it multiple times', async () => {
            const oldEnv = process.env;
            process.env = { ...oldEnv };

            process.env.ACTOR_WEB_SERVER_URL = 'http://127.0.0.1:4321';
            process.env.ACTOR_WEB_SERVER_PORT = '4321';

            const startMock = vi.fn(async () => {});
            const stopMock = vi.fn(() => {});
            const DevToolsCtorMock = vi.fn(() => ({
                start: startMock,
                stop: stopMock,
            }));

            vi.resetModules();
            vi.doMock('devtools-server', () => ({ default: DevToolsCtorMock }));
            vi.doMock('apify', () => ({ Actor: { on: vi.fn() } }));

            const mod = await import('../src/internals/crawler_setup.ts');
            const { CrawlerSetup } = mod as any;

            await Promise.all(
                Array.from({ length: 10 }, () =>
                    // eslint-disable-next-line no-underscore-dangle
                    CrawlerSetup._startDevToolsServerOnce(),
                ),
            );

            expect(DevToolsCtorMock).toHaveBeenCalledTimes(1);
            expect(startMock).toHaveBeenCalledTimes(1);

            process.env = oldEnv;
        });
    });
});
