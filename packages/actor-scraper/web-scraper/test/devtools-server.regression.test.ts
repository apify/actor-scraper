import { describe, expect, it, vi } from 'vitest';

describe('DevToolsServer (regression)', () => {
    it('starts only once even if preLaunchHook calls it multiple times', async () => {
        const oldEnv = process.env;
        const actorOnMock = vi.fn();

        const startMock = vi.fn(async () => {});
        const stopMock = vi.fn(() => {});
        const DevToolsCtorMock = vi.fn(() => ({
            start: startMock,
            stop: stopMock,
        }));

        try {
            process.env = { ...oldEnv };
            process.env.ACTOR_WEB_SERVER_URL = 'http://127.0.0.1:4321';
            process.env.ACTOR_WEB_SERVER_PORT = '4321';

            vi.resetModules();
            vi.doMock('devtools-server', () => ({ default: DevToolsCtorMock }));
            vi.doMock('apify', () => ({ Actor: { on: actorOnMock } }));

            const mod = await import(
                new URL('../src/internals/crawler_setup.ts', import.meta.url)
                    .href
            );
            const { CrawlerSetup } = mod as any;

            CrawlerSetup.devToolsServerPromise = null;

            const fn =
                CrawlerSetup.getDevToolsServer ??
                CrawlerSetup.startDevToolsServerOnce;

            await Promise.all(
                Array.from({ length: 10 }, () => fn.call(CrawlerSetup)),
            );

            expect(DevToolsCtorMock).toHaveBeenCalledTimes(1);
            expect(startMock).toHaveBeenCalledTimes(1);
            expect(actorOnMock).toHaveBeenCalledTimes(1);
            expect(actorOnMock).toHaveBeenCalledWith(
                'exit',
                expect.any(Function),
            );
        } finally {
            process.env = oldEnv;
            vi.resetModules();
        }
    });
});
