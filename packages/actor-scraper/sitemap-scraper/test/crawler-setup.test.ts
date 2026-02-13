import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { log } from '@crawlee/http';

import type { Input } from '../src/internals/consts.js';
import { ProxyRotation } from '../src/internals/consts.js';
import { CrawlerSetup } from '../src/internals/crawler_setup.js';

vi.mock('apify', () => ({
    Actor: {
        isAtHome: () => true,
        getEnv: () => ({}),
        createProxyConfiguration: async () => ({
            newUrl: async () => undefined,
        }),
        fail: async (message: string) => new Error(message),
    },
}));

const createInput = (overrides: Partial<Input> = {}): Input => ({
    startUrls: [{ url: 'https://example.com' }],
    keepUrlFragments: false,
    respectRobotsTxtFile: true,
    pageFunction: '() => ({})',
    proxyConfiguration: { useApifyProxy: false },
    proxyRotation: ProxyRotation.Recommended,
    maxRequestRetries: 3,
    maxCrawlingDepth: 0,
    debugLog: false,
    customData: {},
    ...overrides,
});

describe('CrawlerSetup', () => {
    let initSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        initSpy = vi
            .spyOn(CrawlerSetup.prototype as any, '_initializeAsync')
            .mockResolvedValue(undefined);
    });

    afterEach(() => {
        initSpy.mockRestore();
    });

    it('sets debug log level when debugLog is true', async () => {
        const setLevelSpy = vi.spyOn(log, 'setLevel');

        new CrawlerSetup(createInput({ debugLog: true }));

        expect(setLevelSpy).toHaveBeenCalledWith(log.LEVELS.DEBUG);
    });

    it('stores rawInput as a JSON string', async () => {
        const input = createInput();
        const setup = new CrawlerSetup(input);

        expect(setup.rawInput).toBe(JSON.stringify(input));
    });

    it('uses the expected actor name', async () => {
        const setup = new CrawlerSetup(createInput());
        expect(setup.name).toBe('Sitemap Extractor');
    });
});
