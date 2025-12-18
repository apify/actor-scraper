import type { ProxyConfiguration } from '@crawlee/http';
import { log } from '@crawlee/core';
import { RobotsFile } from '@crawlee/utils';
import { Impit } from 'impit';

export const SITEMAP_REQUEST_TIMEOUT_MILLIS = 30e3;

/**
 * Given a list of URLs, discover related sitemap files for these domains by checking the `robots.txt` file,
 * the default `sitemap.xml` file and the URLs themselves.
 * @param urls The list of URLs to discover sitemaps for.
 * @param proxy The proxy configuration instance to use for the request making.
 * @returns An `Set<string>` with the discovered sitemap URLs.
 */
export async function discoverValidSitemaps(
    urls: string[],
    proxy?: ProxyConfiguration,
): Promise<Set<string>> {
    log.info('Discovering possible sitemap files from the start URLs...');

    const sitemapUrls = new Set<string>();

    const addSitemapUrl = (url: string) => {
        const sizeBefore = sitemapUrls.size;

        sitemapUrls.add(url);

        if (sitemapUrls.size > sizeBefore) {
            log.info(`Found sitemap url '${url}'`);
        }
    };

    const proxyUrl = await proxy?.newUrl();

    const discoverSitemapsForDomainUrls = async (
        hostname: string,
        domainUrls: string[],
    ) => {
        if (!hostname) {
            return;
        }

        log.info(`Discovering possible sitemap files for '${hostname}'...`);

        try {
            const robotsFile = await RobotsFile.find(domainUrls[0], proxyUrl);

            for (const sitemapUrl of robotsFile.getSitemaps()) {
                addSitemapUrl(sitemapUrl);
            }
        } catch (err) {
            log.warning(`Failed to fetch robots.txt file for ${hostname}`, {
                error: err,
            });
        }

        const sitemapUrl = domainUrls.find((url) =>
            /sitemap\.(?:xml|txt)(?:\.gz)?$/i.test(url),
        );

        if (sitemapUrl !== undefined) {
            addSitemapUrl(sitemapUrl);
        } else {
            const firstUrl = new URL(domainUrls[0]);
            firstUrl.pathname = '/sitemap.xml';
            if (await urlExists(firstUrl.toString(), proxyUrl)) {
                addSitemapUrl(firstUrl.toString());
            }

            firstUrl.pathname = '/sitemap.txt';
            if (await urlExists(firstUrl.toString(), proxyUrl)) {
                addSitemapUrl(firstUrl.toString());
            }
        }
    };

    await Promise.all(
        Object.entries(
            Object.groupBy(urls, (url) =>
                URL.canParse(url) ? new URL(url).hostname : '',
            ),
        ).map(async ([hostname, domainUrls]) =>
            discoverSitemapsForDomainUrls(hostname, domainUrls ?? []),
        ),
    );

    if (sitemapUrls.size > 0) {
        log.info(
            `Sitemap discovery finished, found ${sitemapUrls.size} sitemap URLs`,
        );
    } else {
        log.warning(
            'Sitemap discovery finished, no sitemaps were found for the provided start URLs.',
        );
    }

    return sitemapUrls;
}

/**
 * Check if a document with the given URL exists by making a `HEAD` request to it.
 * @param url The URL to check.
 * @param proxyUrl The proxy URL to use for the request.
 * @returns A `Promise` that resolves to `true` if the URL exists, `false` otherwise.
 */
export async function urlExists(
    url: string,
    proxyUrl?: string,
): Promise<boolean> {
    try {
        const response = await new Impit({
            browser: 'firefox',
            proxyUrl,
            ignoreTlsErrors: true,
        }).fetch(url, {
            method: 'HEAD',
        });

        if (response.status < 200 || response.status >= 400) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}
