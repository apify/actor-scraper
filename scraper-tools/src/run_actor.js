const Apify = require('apify');

const { utils: { log } } = Apify;

module.exports.runActor = (CrawlerSetup) => {
    Apify.main(async () => {
        log.debug('Reading INPUT.');
        const input = await Apify.getInput();
        if (!input) throw new Error('INPUT cannot be empty!');

        // Get crawler setup and startup options.
        const setup = new CrawlerSetup(input);
        log.info(`Configuring ${setup.name}.`);
        const crawler = await setup.createCrawler();

        log.info('Configuration completed. Starting the scrape.');
        await crawler.run();
        log.info(`${setup.name} finished.`);
    });
};
