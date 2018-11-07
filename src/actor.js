const Apify = require('apify');
const CrawlerSetup = require('./crawler_setup');

const { utils: { log } } = Apify;

log.logJson = false;

Apify.main(async () => {
    log.debug('Reading INPUT.');
    const input = await Apify.getValue('INPUT');
    if (!input) throw new Error('INPUT cannot be empty!');

    log.debug('Getting environment information.');
    const {
        actId: actorId,
        actRunId: runId,
    } = Apify.getEnv();

    // Get crawler setup and startup options.
    log.info('Configuring the Crawler.');
    const setup = new CrawlerSetup(input);

    log.info('Waiting for asynchronous tasks to complete.');
    const options = await setup.getOptions({ actorId, runId });

    log.info('Async tasks completed. Starting the crawl.');
    const crawler = new Apify.CheerioCrawler(options);
    setup.crawler = crawler;

    await crawler.run();
    log.info('Crawler finished.');
});
