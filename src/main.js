import Apify from 'apify';
import _ from 'underscore';
import { logError, logDebug } from './utils';
import LocalRequestManager from './local_request_manager';
import AutoscaledPool from './autoscaled_pool';
import Request, { TYPES as REQUEST_TYPES } from './request';
import Crawler from './crawler';
import PseudoUrl from './pseudo_url';

const runningRequests = {};

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');
    const requestManager = new LocalRequestManager(input);
    const crawler = new Crawler(input);
    const newRequest = data => new Request(input, data);

    await crawler.initialize();

    // Parse PUrls.
    input.crawlPurls.forEach((purl) => {
        purl.parsedPurl = new PseudoUrl(purl.value);
    });

    // Enqueue start urls.
    input.startUrls
        .map(item => newRequest({
            label: item.key,
            url: item.value,
            type: REQUEST_TYPES.START_URL,
        }))
        .forEach(request => requestManager.addNewRequest(request));

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

        requestManager.addNewRequest(request);
    });

    const promiseProducer = () => {
        const request = requestManager.fetchNextRequest();

        if (!request || runningRequests[request.id]) return;

        return new Promise(async (resolve) => {
            runningRequests[request.id] = request;

            try {
                await crawler.crawl(request);
                requestManager.markRequestHandled(request);
                delete runningRequests[request.id];
            } catch (err) {
                logError(`Request failed (${request})`, err);
                delete runningRequests[request.id];
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

    // Output result.
    const resultsArray = requestManager
        .handledRequests
        .map(request => request.toJSON());

    await Apify.setValue('OUTPUT', resultsArray);

    console.log(resultsArray.map(row => _.omit(row, 'pageFunctionResult')));
});
