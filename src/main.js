import Apify from 'apify';
import _ from 'underscore';
import LocalRequestManager from './local_request_manager';
import AutoscaledPool from './autoscaled_pool';
import Request from './request';
import Crawler, { CRAWLER_OPTIONS } from './crawler';

const runningRequests = {};

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');
    const requestManager = new LocalRequestManager();
    const crawler = new Crawler(_.pick(input, CRAWLER_OPTIONS));
    const newRequest = data => new Request(input, data);

    await crawler.initialize();

    // Enqueue start urls.
    input.startUrls
        .map(item => newRequest({ label: item.key, url: item.value }))
        .forEach(request => requestManager.addNewRequest(request));

    const promiseProducer = () => {
        const request = requestManager.fetchNextRequest();

        if (!request || runningRequests[request.id]) return;

        return new Promise(async (resolve) => {
            runningRequests[request.id] = request;

            try {
                const result = await crawler.crawl(request);
                requestManager.markRequestHandled(request);

                console.log(result);
                delete runningRequests[request.id];
            } catch (err) {
                console.log(err);
                delete runningRequests[request.id];
            }

            resolve();
        });
    };

    const pool = new AutoscaledPool({
        promiseProducer,
        maxConcurrency: input.maxParallelRequests,
    });

    await pool.start();
    await crawler.destroy();
});
