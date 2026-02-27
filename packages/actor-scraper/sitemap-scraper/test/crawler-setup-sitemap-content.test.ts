import { gzipSync } from 'node:zlib';

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

describe('CrawlerSetup sitemap content parsing', () => {
    let initSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        initSpy = vi
            .spyOn(CrawlerSetup.prototype as any, '_initializeAsync')
            .mockResolvedValue(undefined);
    });

    afterEach(() => {
        initSpy.mockRestore();
    });

    it('keeps plain XML body untouched', async () => {
        const setup = new CrawlerSetup(createInput());
        const sitemapContent = await (setup as any).getSitemapContent(
            'https://example.com/sitemap.xml',
            '<urlset></urlset>',
            'application/xml',
        );

        expect(sitemapContent).toBe('<urlset></urlset>');
    });

    it('decompresses gzip sitemap body by MIME type', async () => {
        const setup = new CrawlerSetup(createInput());
        const xml =
            '<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://example.com/</loc></url></urlset>';
        const gzippedXml = gzipSync(Buffer.from(xml, 'utf8'));

        const sitemapContent = await (setup as any).getSitemapContent(
            'https://example.com/sitemap.xml.gz',
            gzippedXml,
            'application/gzip',
        );

        expect(sitemapContent).toBe(xml);
    });

    it('keeps plain text body untouched', async () => {
        const setup = new CrawlerSetup(createInput());
        const sitemapContent = await (setup as any).getSitemapContent(
            'https://example.com/sitemap.txt',
            Buffer.from('https://example.com/page', 'utf8'),
            'text/plain; charset=utf-8',
        );

        expect(sitemapContent).toBe('https://example.com/page');
    });

    it('decompresses gzip sitemap body by URL extension', async () => {
        const setup = new CrawlerSetup(createInput());
        const xml =
            '<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://example.com/blog</loc></url></urlset>';
        const gzippedXml = gzipSync(Buffer.from(xml, 'utf8'));

        const sitemapContent = await (setup as any).getSitemapContent(
            'https://example.com/sitemap_index.xml.gz',
            gzippedXml,
            'application/octet-stream',
        );

        expect(sitemapContent).toBe(xml);
    });

    it('decompresses double-gzipped sitemap body', async () => {
        const setup = new CrawlerSetup(createInput());
        const xml =
            '<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://example.com/double</loc></url></urlset>';
        const doubleGzippedXml = gzipSync(gzipSync(Buffer.from(xml, 'utf8')));

        const sitemapContent = await (setup as any).getSitemapContent(
            'https://example.com/sitemap.xml.gz',
            doubleGzippedXml,
            'application/gzip',
        );

        expect(sitemapContent).toBe(xml);
    });
});
