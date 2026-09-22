import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { constants } from '@apify/scraper-tools';

import { type Input, ProxyRotation } from '../src/internals/consts.js';
import { CrawlerSetup } from '../src/internals/crawler_setup.js';

const { META_KEY } = constants;

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

const createPageContext = (userData: Record<string, unknown>, headers: Headers | Record<string, string> = {}): any => ({
    request: {
        url: 'https://example.com/page',
        userData,
    },
    response: {
        statusCode: 200,
        headers,
    },
});

describe('CrawlerSetup lastmod handling', () => {
    let initSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        initSpy = vi.spyOn(CrawlerSetup.prototype as any, '_initializeAsync').mockResolvedValue(undefined);
    });

    afterEach(() => {
        initSpy.mockRestore();
    });

    it('prefers the sitemap <lastmod> over the Last-Modified header', async () => {
        const setup = new CrawlerSetup(createInput());
        const handleResult = vi.spyOn(setup as any, '_handleResult').mockResolvedValue(undefined);

        await (setup as any)._handlePageRequest(
            createPageContext(
                { [META_KEY]: { depth: 1, sitemapLastmod: '2024-01-01T00:00:00.000Z' } },
                { 'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT' },
            ),
        );

        const result = handleResult.mock.calls[0][2];
        expect(result).toMatchObject({
            url: 'https://example.com/page',
            status: 200,
            lastmod: '2024-01-01T00:00:00.000Z',
        });
        expect(result).not.toHaveProperty('lastModifiedHeader');
    });

    it('falls back to the Last-Modified header, normalized to ISO 8601, when the sitemap has none', async () => {
        const setup = new CrawlerSetup(createInput());
        const handleResult = vi.spyOn(setup as any, '_handleResult').mockResolvedValue(undefined);

        await (setup as any)._handlePageRequest(
            createPageContext({ [META_KEY]: { depth: 1 } }, { 'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT' }),
        );

        const result = handleResult.mock.calls[0][2];
        expect(result).toMatchObject({ lastmod: '2015-10-21T07:28:00.000Z' });
    });

    it('reads the Last-Modified header from Web Headers returned by the HTTP client', async () => {
        const setup = new CrawlerSetup(createInput());
        const handleResult = vi.spyOn(setup as any, '_handleResult').mockResolvedValue(undefined);

        await (setup as any)._handlePageRequest(
            createPageContext(
                { [META_KEY]: { depth: 1 } },
                new Headers({ 'last-modified': 'Fri, 26 Jun 2026 11:10:48 GMT' }),
            ),
        );

        const result = handleResult.mock.calls[0][2];
        expect(result).toMatchObject({ lastmod: '2026-06-26T11:10:48.000Z' });
    });

    it('reports null lastmod when neither source provides last-modification data', async () => {
        const setup = new CrawlerSetup(createInput());
        const handleResult = vi.spyOn(setup as any, '_handleResult').mockResolvedValue(undefined);

        await (setup as any)._handlePageRequest(createPageContext({ [META_KEY]: { depth: 1 } }, {}));

        const result = handleResult.mock.calls[0][2];
        expect(result).toMatchObject({ lastmod: null });
    });

    it('carries the sitemap lastmod onto enqueued page requests', async () => {
        const setup = new CrawlerSetup(createInput());

        let transform: ((opts: any) => any) | undefined;
        const enqueueLinks = vi.fn(async ({ transformRequestFunction }: any) => {
            transform = transformRequestFunction;
        });

        // Second URL is a bare root, normalized to `https://example.com/` by enqueueLinks.
        const pages = [
            { url: 'https://example.com/a', lastmod: '2024-05-05T00:00:00.000Z' },
            { url: 'https://example.com', lastmod: '2024-06-06T00:00:00.000Z' },
            { url: 'https://example.com/c' },
        ];

        await (setup as any)._enqueuePageRequests(pages, {
            request: { id: 'parent', uniqueKey: 'parent', userData: { [META_KEY]: { depth: 0 } } },
            enqueueLinks,
        });

        expect(enqueueLinks).toHaveBeenCalledWith(
            expect.objectContaining({
                urls: ['https://example.com/a', 'https://example.com', 'https://example.com/c'],
            }),
        );

        const withLastmod = transform!({ url: 'https://example.com/a' });
        expect(withLastmod.userData[META_KEY].sitemapLastmod).toBe('2024-05-05T00:00:00.000Z');
        expect(withLastmod.method).toBe('HEAD');

        const normalizedRoot = transform!({ url: 'https://example.com/' });
        expect(normalizedRoot.userData[META_KEY].sitemapLastmod).toBe('2024-06-06T00:00:00.000Z');

        const withoutLastmod = transform!({ url: 'https://example.com/c' });
        expect(withoutLastmod.userData[META_KEY].sitemapLastmod).toBeUndefined();
    });
});
