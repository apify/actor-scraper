import request from 'request-promise';
import StatefulClass from './stateful_class';
import { logDebug } from './utils';
import Request, { TYPES as REQUEST_TYPES } from './request';

const DEFAULT_STATE = {
    position: 0,
};

export const STATE_KEY = 'STATE-url-list.json';

export default class UrlList extends StatefulClass {
    constructor(state = DEFAULT_STATE, crawlerConfig) {
        super('UrlList', STATE_KEY);

        this.crawlerConfig = crawlerConfig;
        this.state = state;
        this.state.url = crawlerConfig.urlList;
        this.state.urlListRegex = crawlerConfig.urlListRegex;
        this.urls = null;
    }

    async initialize() {
        const str = await request(this.state.url);

        if (this.state.urlListRegex) {
            this.urls = str.match(this.state.urlListRegex);
        } else {
            this.urls = str
                .trim()
                .split('\n')
                .map(line => line.trim())
                .filter(line => line);
        }

        logDebug(`UrlList: ${this.urls.length} urls fetched`);
        logDebug(`UrlList: sample of fetched urls (1.-5.) ${JSON.stringify(this.urls.slice(0, 5))}`);
    }

    fetchNext() {
        logDebug('UrlList: fetching next url');

        if (this.state.position >= this.urls.length) {
            logDebug('UrlList: all urls fetched');
            return;
        }

        const url = this.urls[this.state.position];

        this.state.position ++;

        return new Request(this.crawlerConfig, { url, type: REQUEST_TYPES.START_URL });
    }

    destroy() {
        super.destroy();
    }
}
