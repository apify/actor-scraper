const Apify = require('apify');
const CrawlerSetup = require('./crawler_setup');

const { utils: { log } } = Apify;

log.logJson = false;

Apify.main(async () => {
    log.debug('Reading INPUT.');
    const input = await Apify.getInput();
    if (!input) throw new Error('INPUT cannot be empty!');

    // Get crawler setup and startup options.
    log.info('Configuring Web Scraper.');
    const setup = new CrawlerSetup(input, env);
    const crawler = await setup.createCrawler();

    log.info('Configuration completed. Starting the scrape.');
    await crawler.run();
    log.info('Web Scraper finished.');
});
