import { expect, getDatasetItems, getStats, getTestDir, run, validateDataset } from '../../tools.mjs';

const testDir = getTestDir(import.meta.url);

const { exit } = process;
process.exit = () => {};

await run(testDir, 'cheerio-scraper', {
    startUrls: [
        {
            url: 'https://crawlee.dev/js/docs/guides/request-storage',
            method: 'GET',
            userData: { label: 'START' },
        },
    ],
    keepUrlFragments: false,
    maxPagesPerCrawl: 10,
    pageFunction: async function pageFunction(context) {
        switch (context.request.userData.label) {
            case 'START':
                return handleStart(context);
            case 'DETAIL':
                return handleDetail(context);
            default:
                throw new Error(`Unrecognized request label: ${context.request.userData.label}`);
        }

        async function handleStart({ enqueueRequest, $ }) {
            const links = $('a[href^="/js/docs/guides/"]')
                .toArray()
                .map((item) => $(item).attr('href'));
            for (const link of links) {
                const actorDetailUrl = `https://crawlee.dev${link}`;
                await enqueueRequest({
                    url: actorDetailUrl,
                    userData: { label: 'DETAIL' },
                });
            }
        }

        async function handleDetail({ request, log, skipLinks, $ }) {
            const { url } = request;
            log.info(`Scraping ${url}`);
            await skipLinks();

            const uniqueIdentifier = url.split('/').slice(-2).join('/');
            const title = $('h1').first().text();
            const description = $('article p').first().text();

            return {
                url,
                uniqueIdentifier,
                title,
                description,
            };
        }
    },
    proxyConfiguration: { useApifyProxy: false },
    proxyRotation: 'RECOMMENDED',
    forceResponseEncoding: false,
    ignoreSslErrors: false,
    debugLog: false,
});

process.exit = exit;

const stats = await getStats(testDir);
await expect(stats.requestsFinished >= 10, 'All requests finished');

const datasetItems = await getDatasetItems(testDir);
await expect(datasetItems.length > 5 && datasetItems.length < 15, 'Number of dataset items');
await expect(
    validateDataset(datasetItems, ['url', 'title', 'uniqueIdentifier', 'description']),
    'Dataset items validation',
);

process.exit(0);
