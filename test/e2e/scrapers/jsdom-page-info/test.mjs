import { expect, getDatasetItems, getStats, getTestDir, run, validateDataset } from '../../tools.mjs';

const testDir = getTestDir(import.meta.url);

const { exit } = process;
process.exit = () => {};

await run(testDir, 'jsdom-scraper', {
    startUrls: [
        {
            url: 'https://crawlee.dev/js/docs/guides/request-storage',
            method: 'GET',
            userData: { label: 'START' },
        },
    ],
    keepUrlFragments: false,
    pseudoUrls: [
        {
            purl: 'https://crawlee.dev/js/docs/guides/result-storage',
            method: 'GET',
            userData: { label: 'DETAIL' },
        },
    ],
    linkSelector: 'a',
    // eslint-disable-next-line consistent-return -- simplifies branching in pageFunction
    pageFunction: async function pageFunction(context) {
        const { request, log, skipLinks, window } = context;
        const {
            userData: { label },
        } = request;
        const { document } = window;

        if (label === 'START') {
            log.info('Start page opened!');
        }

        if (label === 'DETAIL') {
            const { url } = request;
            log.info(`Scraping ${url}`);
            await skipLinks();

            const title = document.querySelector('h1').textContent;
            const description = document.querySelector('article p').textContent;

            return { url, title, description };
        }
    },
    proxyConfiguration: { useApifyProxy: false },
    proxyRotation: 'RECOMMENDED',
    forceResponseEncoding: false,
    ignoreSslErrors: false,
    debugLog: false,
    runScripts: false,
});

process.exit = exit;

const stats = await getStats(testDir);
await expect(stats.requestsFinished === 2, 'All requests finished');

const datasetItems = await getDatasetItems(testDir);
await expect(datasetItems.length === 1, 'Number of dataset items');
await expect(validateDataset(datasetItems, ['url', 'title', 'description']), 'Dataset items validation');

process.exit(0);
