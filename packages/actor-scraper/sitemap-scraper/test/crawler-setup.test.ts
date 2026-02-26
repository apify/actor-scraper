import { log } from '@crawlee/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Input, ProxyRotation } from '../src/internals/consts.js';
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

        const setup = new CrawlerSetup(createInput({ debugLog: true }));

        expect(setLevelSpy).toHaveBeenCalledWith(log.LEVELS.DEBUG);
        expect(setup).toBeInstanceOf(CrawlerSetup);
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

    it('uses raw source for XML responses', async () => {
        const setup = new CrawlerSetup(createInput());
        const sources = (setup as any)._createSitemapSources(
            'https://example.com/sitemap.xml',
            '<urlset></urlset>',
            'application/xml',
        );

        expect(sources).toStrictEqual([
            { type: 'raw', content: '<urlset></urlset>' },
        ]);
    });

    it('uses URL source for gzip MIME responses', async () => {
        const setup = new CrawlerSetup(createInput());
        const sources = (setup as any)._createSitemapSources(
            'https://example.com/sitemap.xml.gz',
            Buffer.from('binary'),
            'application/gzip',
        );

        expect(sources).toStrictEqual([
            { type: 'url', url: 'https://example.com/sitemap.xml.gz' },
        ]);
    });

    it('uses URL source for text/plain sitemap responses', async () => {
        const setup = new CrawlerSetup(createInput());
        const sources = (setup as any)._createSitemapSources(
            'https://example.com/sitemap.txt',
            Buffer.from('https://example.com/page'),
            'text/plain; charset=utf-8',
        );

        expect(sources).toStrictEqual([
            { type: 'url', url: 'https://example.com/sitemap.txt' },
        ]);
    });

    it('uses URL source for .gz URL even with unknown MIME', async () => {
        const setup = new CrawlerSetup(createInput());
        const sources = (setup as any)._createSitemapSources(
            'https://example.com/sitemap_index.xml.gz',
            Buffer.from('binary'),
            'application/octet-stream',
        );

        expect(sources).toStrictEqual([
            { type: 'url', url: 'https://example.com/sitemap_index.xml.gz' },
        ]);
    });
});
