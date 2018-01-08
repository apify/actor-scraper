/**
 * This module is main file of the act.
 * Initializes all the components and closes all the resources.
 */

import Apify from 'apify';
import _ from 'underscore';
import Promise from 'bluebird';
import path from 'path';
import childProcess from 'child_process';
import eventLoopStats from 'event-loop-stats';
import { logInfo, logError, logDebug, getValueOrUndefined, setValue, waitForPendingSetValues, deleteNullProperties } from './modules/utils';
import AutoscaledPool from './modules/autoscaled_pool';
import Request, { TYPES as REQUEST_TYPES } from './modules/request';
import Crawler, { EVENT_SNAPSHOT, EVENT_REQUEST } from './modules/crawler';
import { EVENT_VALUE } from './modules/stateful_class';
import PseudoUrl from './modules/pseudo_url';
import LocalPageQueue, { STATE_KEY as PAGE_QUEUE_STATE_KEY } from './modules/local_page_queue';
import LocalSequentialStore, { STATE_KEY as SEQ_STORE_STATE_KEY } from './modules/local_sequential_store';
import UrlList, { STATE_KEY as URL_LIST_STATE_KEY } from './modules/url_list';

const { APIFY_ACT_ID, APIFY_ACT_RUN_ID, NODE_ENV } = process.env;

// This catches and logs all unhandled rejects, there are a lot of them for example
// if page gets closed then opened requests for all assets failes etc.
process.on('unhandledRejection', err => logError('Unhanled promise rejection', err));

const INPUT_DEFAULTS = {
    maxPageRetryCount: 3,
    minParallelRequests: 20,
    maxParallelRequests: 1,
    maxCrawledPagesPerSlave: 50,
    maxPagesPerFile: 1000,
    browserInstanceCount: (NODE_ENV === 'production') ? 10 : 1,
    startUrls: [],
    pageFunctionTimeout: 60000,
    dumpio: true,
    saveSimplifiedResults: false,
};

/**
 * Fetches input and if there is a input.crawlerId then gets crawler configuration
 * and meres it with the input (input has higher priority).
 * Then merges input with defaults and parses some values.
 */
const fetchInput = async () => {
    const input = await Apify.getValue('INPUT');

    const crawler = input.crawlerId
        ? await Apify.client.crawlers.getCrawlerSettings({ crawlerId: input.crawlerId })
        : {};

    // NOTE: In old crawler settings can be some values null, replace them with default values
    deleteNullProperties(crawler);
    deleteNullProperties(input);

    const mergedInput = _.defaults(input, crawler, INPUT_DEFAULTS, {
        actId: APIFY_ACT_ID,
        runId: APIFY_ACT_RUN_ID,
    });

    mergedInput.crawlPurls = mergedInput.crawlPurls || [];
    mergedInput.crawlPurls.forEach((purl) => {
        purl.parsedPurl = new PseudoUrl(purl.value);
    });

    if (mergedInput.customProxies && _.isString(mergedInput.customProxies)) {
        mergedInput.customProxies = mergedInput.customProxies.split('\n');
    }

    logInfo(`Merged input: ${JSON.stringify(mergedInput, null, 2)}`);

    return mergedInput;
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

// This prints statistics about event loop every 30s.
// It's in form { ..., sum: 12000 } where sum is total time spend by event loop
// since the last call os if it's under 30s then we are OK.
const eventLoopInfoInterval = setInterval(() => {
    logInfo(`Event loop stats: ${JSON.stringify(eventLoopStats.sense())}`);
}, 30 * 1000);

// This prints memory usage of all processes every 30s.
const memoryInfoInterval = setInterval(() => {
    const cmd = path.join(__dirname, '..', 'get_memory_usage.sh');
    const opts = { maxBuffer: 10 * 1024 * 1024 };

    childProcess.exec(cmd, opts, (err, stdOut, stdErr) => {
        if (err || stdErr) logError('Cannot get memory', err || stdErr);
        logInfo(`Memory: ${stdOut}`);
    });
}, 30 * 1000);

/**
 * This is the main function that runs just once and then act gets finished.
 */
Apify.main(async () => {
    const input = await fetchInput();

    const sequentialStore = await createSeqStore(input);
    const pageQueue = await createPageQueue(input);
    const crawler = await createCrawler(input);
    const urlList = await maybeCreateUrlList(input);

    enqueueStartUrls(input, pageQueue);

    // Saves handled (crawled) pages to sequential store.
    pageQueue.on('handled', request => sequentialStore.put(request));

    // This event is trigered by context.enqueuePage().
    crawler.on(EVENT_REQUEST, (request) => {
        // context.enqueuePage() is not a subject of maxCrawlDepth
        if (input.maxCrawlDepth && request.type !== REQUEST_TYPES.USER_ENQUEUED && request.depth > input.maxCrawlDepth) {
            logDebug(`Not enqueuing ${request.url}, type = ${request.type}, max depth reached`);
            return;
        }
        if (!request.willLoad) {
            logDebug(`Not enqueuing ${request.url}, type = ${request.type}, willLoad = false`);
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

    // Function promiseProducer is called by AutoscaledPool everytime there is a free slot in the
    // pool to process another request. It returns promise that during the run has allocated slot
    // in the pool. After it's resoved or rejected the AutoscaledPool calls promiseProducer() to
    // get another promise and so on ...
    // When promiseProducer returns null or undefined autoscaled pool waits for all promises to be
    // finished and resolves
    let isUrlListDone = false;
    let runningCount = 0;
    const runningRequests = {};
    const promiseProducer = () => {
        let request;

        // Try to fetch request from url list first.
        if (urlList && !isUrlListDone && (!input.maxCrawledPages || pageQueue.getPageCount() < input.maxCrawledPages)) {
            request = urlList.fetchNext();

            if (request) pageQueue.enqueue(request);
            else isUrlListDone = true;
        }

        // If no one is find or request is running then try to fetch it from pageQueue.
        if (!request || runningRequests[request.id]) {
            for (let i = 0; i <= runningCount; i++) {
                request = pageQueue.fetchNext();

                // We are done.
                if (!request) return;

                // If request is not running then use it.
                if (!runningRequests[request.id]) break;
            }

            if (runningRequests[request.id]) return;
        }

        // Here we process the page with crawler and if succedes then dequeue it or
        // add error info otherwise.
        return new Promise(async (resolve) => {
            runningRequests[request.id] = request;
            runningCount++;

            try {
                await crawler.crawl(request);
                pageQueue.dequeue(request);
                delete runningRequests[request.id];
                runningCount--;
            } catch (err) {
                request.errorInfo.push(`${input.fullStackTrace ? err.stack : err}`);
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

            setTimeout(resolve, 500); // @TODO implement as randomWaitBetweenRequests param with random wait as in crawler
        });
    };

    // Run pool.
    const pool = new AutoscaledPool({
        promiseProducer,
        maxConcurrency: input.maxParallelRequests,
        minConcurrency: input.minParallelRequests,
    });
    await pool.start();

    // Cleanup resources - intervals, etc ...
    await crawler.destroy();
    sequentialStore.destroy();
    pageQueue.destroy();
    pool.destroy();
    if (urlList) urlList.destroy();
    clearInterval(eventLoopInfoInterval);
    clearInterval(memoryInfoInterval);

    // Apify.setValue() is called asynchronously on events so we need to await all the pending
    // requests.
    await waitForPendingSetValues();
});

// @TODO: remove - this is attempt to test memory leak
// TMP test - trying to kill process every 1,5h
setTimeout(() => process.exit(1), 2 * 60 * 60 * 1000);
