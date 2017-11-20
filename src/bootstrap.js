import Apify from 'apify';
import _ from 'underscore';
import Promise from 'bluebird';
import { logError, logDebug, getValueOrUndefined, setValue, waitForPendingSetValues } from './modules/utils';
import AutoscaledPool from './modules/autoscaled_pool';
import Request, { TYPES as REQUEST_TYPES } from './modules/request';
import Crawler, { EVENT_SNAPSHOT, EVENT_REQUEST } from './modules/crawler';
import { EVENT_VALUE } from './modules/stateful_class';
import PseudoUrl from './modules/pseudo_url';
import LocalPageQueue, { STATE_KEY as PAGE_QUEUE_STATE_KEY } from './modules/local_page_queue';
import LocalSequentialStore, { STATE_KEY as SEQ_STORE_STATE_KEY } from './modules/local_sequential_store';
import UrlList, { STATE_KEY as URL_LIST_STATE_KEY } from './modules/url_list';

const { APIFY_ACT_ID, APIFY_ACT_RUN_ID } = process.env;

process.on('unhandledRejection', err => console.log(err));

const INPUT_DEFAULTS = {
    maxPageRetryCount: 3,
    maxParallelRequests: 1,
    maxPagesPerFile: 100,
    startUrls: [],
};

const fetchInput = async () => {
    const input = await Apify.getValue('INPUT');

    if (!input.crawlerId) return input;

    const crawler = await Apify.client.crawlers.getCrawlerSettings({ crawlerId: input.crawlerId });

    return Object.assign({}, input, crawler);
};

const createSeqStore = async (input) => {
    const state = await getValueOrUndefined(SEQ_STORE_STATE_KEY);
    const sequentialStore = new LocalSequentialStore(state, input);

    sequentialStore.on(EVENT_VALUE, setValue);

    return sequentialStore;
};

const createPageQueue = async (input) => {
    const state = await getValueOrUndefined(PAGE_QUEUE_STATE_KEY);
    const pageQueue = new LocalPageQueue(state, input);

    pageQueue.on(EVENT_VALUE, setValue);

    return pageQueue;
};

const createCrawler = async (input) => {
    const crawler = new Crawler(input);
    await crawler.initialize();

    return crawler;
};

const maybeCreateUrlList = async (input) => {
    if (!input.urlList) return;

    const state = await getValueOrUndefined(URL_LIST_STATE_KEY);
    const urlList = new UrlList(state, input);

    urlList.on(EVENT_VALUE, setValue);

    await urlList.initialize();

    return urlList;
};

const parsePurls = (input) => {
    input.crawlPurls = input.crawlPurls || [];
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
    const input = await fetchInput();

    _.defaults(input, INPUT_DEFAULTS);
    _.extend(input, {
        actId: APIFY_ACT_ID,
        runId: APIFY_ACT_RUN_ID,
    });

    const sequentialStore = await createSeqStore(input);
    const pageQueue = await createPageQueue(input);
    const crawler = await createCrawler(input);
    const urlList = await maybeCreateUrlList(input);

    pageQueue.on('handled', request => sequentialStore.put(request.toJSON()));

    parsePurls(input);
    enqueueStartUrls(input, pageQueue);

    // This event is trigered by context.enqueuePage().
    crawler.on(EVENT_REQUEST, (request) => {
        // context.enqueuePage() is not a subject of maxCrawlDepth
        if (input.maxCrawlDepth && request.type !== REQUEST_TYPES.USER_ENQUEUED && request.depth > input.maxCrawlDepth) {
            logDebug(`Not qneueuing ${request.url}, type = ${request.type}, max depth reached`);
            return;
        }
        if (!request.willLoad) {
            logDebug(`Not qneueuing ${request.url}, type = ${request.type}, willLoad = false`);
            return;
        }

        pageQueue.enqueue(request);
    });

    // This event is trigered by context.saveSnapshot().
    crawler.on(EVENT_SNAPSHOT, ({ url, html, screenshot }) => {
        const filename = url.replace(/\W+/g, '-');

        setValue({ key: `SNAPSHOT-${filename}.html`, body: html, contentType: 'text/html' });
        setValue({ key: `SNAPSHOT-${filename}.jpg`, body: screenshot, contentType: 'image/png' });
    });

    let runningCount = 0;
    const runningRequests = {};
    const promiseProducer = (recursionDepth = 0) => {
        let request;

        // Try to fetch request from url list first.
        if (urlList) {
            request = urlList.fetchNext();

            if (request) pageQueue.enqueue(request);
        }

        // If no one is find then try to fetch it from pageQueue.
        if (!request || runningRequests[request.id]) {
            request = pageQueue.fetchNext();
        }

        // We are done.
        if (!request) return;

        // If it's running already then try another one.
        // TODO: We should do this without recursion.
        if (runningRequests[request.id]) {
            if (recursionDepth > runningCount) return;

            return promiseProducer(recursionDepth + 1);
        }

        return new Promise(async (resolve) => {
            runningRequests[request.id] = request;
            runningCount++;

            try {
                await crawler.crawl(request);
                pageQueue.dequeue(request);
                delete runningRequests[request.id];
                runningCount--;
            } catch (err) {
                request.errorInfo += `${err}\n`;
                logError(`Request failed (${request})`, err);
                delete runningRequests[request.id];
                runningCount--;

                if (request.retryCount === input.maxPageRetryCount) {
                    logDebug(`Load failed too many times, giving up (request.id: ${request.id}, retryCount: ${request.retryCount})`);
                    pageQueue.dequeue(request);
                } else {
                    request.retryCount ++;
                }
            }

            setTimeout(resolve, 1000); // @TODO randomWaitBetweenRequests
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
    if (urlList) urlList.destroy();
    await waitForPendingSetValues();
});
