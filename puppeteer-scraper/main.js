const { runActor } = require('@apify/scraper-tools');
const CrawlerSetup = require('./src/crawler_setup');

runActor(CrawlerSetup);
