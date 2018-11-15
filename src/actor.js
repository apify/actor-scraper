const Apify = require('apify');
const CrawlerSetup = require('./crawler_setup');

const { utils: { log } } = Apify;

log.logJson = false;

Apify.main(async () => {
    log.debug('Reading INPUT.');
    const input = await Apify.getValue('INPUT');
    if (!input) throw new Error('INPUT cannot be empty!');

    log.debug('Getting environment information.');
    const env = Apify.getEnv();

    // Get crawler setup and startup options.
    log.info('Configuring the Crawler.');
    const setup = new CrawlerSetup(input, env);
    const crawler = await setup.createCrawler();

    log.info('Configuration completed. Starting the crawl.');
    await crawler.run();
    log.info('Crawler finished.');
});
