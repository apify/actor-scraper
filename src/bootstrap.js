import Apify from 'apify';
import crawlerMain from './act_crawler';
import crawlUrlListMain from './act_crawl_url_list';

switch (process.env.ACT_TYPE) {
    case 'CRAWLER':
        Apify.main(crawlerMain);
        break;
    case 'CRAWL_URL_LIST':
        Apify.main(crawlUrlListMain);
        break;
    default:
        throw new Error('Missing ACT_TYPE env variable!');
}
