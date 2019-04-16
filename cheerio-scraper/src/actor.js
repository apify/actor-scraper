const Apify = require('apify');
const CrawlerSetup = require('./crawler_setup');

const { utils: { log } } = Apify;

Apify.main(async () => {
    log.debug('Reading INPUT.');
    const input = await Apify.getInput();
    if (!input) throw new Error('INPUT cannot be empty!');

    // Get crawler setup and startup options.
    log.info('Configuring Cheerio Scraper.');
    const setup = new CrawlerSetup(input);
    const crawler = await setup.createCrawler();

    log.info('Configuration completed. Starting the scrape.');
    await crawler.run();
    log.info('Cheerio Scraper finished.');
});
