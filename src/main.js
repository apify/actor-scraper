import Apify from 'apify';
import _ from 'underscore';
import { logError, logDebug, getValueOrUndefined, setValue, waitForPendingSetValues } from './utils';
import AutoscaledPool from './autoscaled_pool';
import Request, { TYPES as REQUEST_TYPES } from './request';
import Crawler from './crawler';
import PseudoUrl from './pseudo_url';
import LocalPageQueue, { STATE_KEY as PAGE_QUEUE_STATE_KEY } from './local_page_queue';
import LocalSequentialStore, { STATE_KEY as SEQ_STORE_STATE_KEY } from './local_sequential_store';

const { APIFY_ACT_ID, APIFY_ACT_RUN_ID } = process.env;
const runningRequests = {};

const createSeqStore = async (input) => {
    const state = await getValueOrUndefined(SEQ_STORE_STATE_KEY);
    const sequentialStore = new LocalSequentialStore(state, input);

    return sequentialStore;
};

const createPageQueue = async (input) => {
    const state = await getValueOrUndefined(PAGE_QUEUE_STATE_KEY);
    const pageQueue = new LocalPageQueue(state, input);

    return pageQueue;
};

const createCrawler = async (input) => {
    const crawler = new Crawler(input);
    await crawler.initialize();

    return crawler;
};

const parsePurls = (input) => {
    input.crawlPurls.forEach((purl) => {
        purl.parsedPurl = new PseudoUrl(purl.value);
    });
};

const enqueueStartUrls = (input, pageQueue) => {
    input.startUrls
        .map((item) => {
            const opts = {
                label: item.key,
                url: item.value,
                type: REQUEST_TYPES.START_URL,
            };

            return new Request(input, opts);
        })
        .forEach((request) => {
            pageQueue.enqueue(request);
        });
};

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');

    _.extend(input, {
        actId: APIFY_ACT_ID,
        runId: APIFY_ACT_RUN_ID,
    });

    const sequentialStore = await createSeqStore(input);
    const pageQueue = await createPageQueue(input);
    const crawler = await createCrawler(input);

    sequentialStore.on('value', ({ key, body }) => setValue(key, body));
    pageQueue.on('value', ({ key, body }) => setValue(key, body));
    pageQueue.on('handled', request => sequentialStore.put(request.toJSON()));

    parsePurls(input);
    enqueueStartUrls(input, pageQueue);

    // This event is trigered by context.enqueuePage().
    crawler.on('request', (request) => {
        // context.enqueuePage() is not a subject of maxCrawlingDepth
        if (input.maxCrawlingDepth && request.type !== REQUEST_TYPES.USER_ENQUEUED && request.depth > input.maxCrawlingDepth) {
            logDebug(`Not qneueuing ${request.url}, max depth reached`);
            return;
        }
        if (!request.willLoad) {
            logDebug(`Not qneueuing ${request.url}, willLoad = false`);
            return;
        }

        pageQueue.enqueue(request);
    });

    // This event is trigered by context.saveSnapshot().
    crawler.on('snapshot', ({ url, html, screenshot }) => {
        const filename = url.replace(/\W+/g, '-');

        setValue(`SNAPSHOT-${filename}.html`, html, { contentType: 'text/html' });
        setValue(`SNAPSHOT-${filename}.jpg`, screenshot, { contentType: 'image/png' });
    });

    const promiseProducer = () => {
        const request = pageQueue.fetchNext();

        if (!request || runningRequests[request.id]) return;

        return new Promise(async (resolve) => {
            runningRequests[request.id] = request;

            try {
                await crawler.crawl(request);
                pageQueue.dequeue(request);
                delete runningRequests[request.id];
            } catch (err) {
                request.retryCount ++;
                logError(`Request failed (${request})`, err);
                delete runningRequests[request.id];
            }

            resolve();
            // setTimeout(resolve, 1000); // @TODO randomWaitBetweenRequests
        });
    };

    // Run pool.
    const pool = new AutoscaledPool({
        promiseProducer,
        maxConcurrency: input.maxParallelRequests,
    });
    await pool.start();
    await crawler.destroy();
    sequentialStore.destroy();
    pageQueue.destroy();
    await waitForPendingSetValues();
});
