/**
 * This class is implementation of list of urls that gets requested from url
 * defined by crawlerConfig.urlList.
 *
 * If crawlerConfig.urlListRegExp to match urls is not defined then file gets
 * splited by new-line character assuming that one line contains one url.
 *
 * Position in the list is persisted in key-value store.
 */

import request from 'request-promise';
import StatefulClass from './stateful_class';
import { logDebug, logInfo } from './utils';
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
        this.state.urlListRegExp = crawlerConfig.urlListRegExp;
        this.urls = crawlerConfig.urlListArr;
    }

    async initialize() {
        if (!this.state.url) return;

        const str = await request(this.state.url);

        if (this.state.urlListRegExp) {
            this.urls = str.match(new RegExp(this.state.urlListRegExp, 'g'));
        } else {
            this.urls = str
                .trim()
                .split('\n')
                .map(line => line.trim())
                .filter(line => line);
        }

        logInfo(`UrlList: ${this.urls.length} urls fetched`);
        logInfo(`UrlList: sample of fetched urls (1.-5.) ${JSON.stringify(this.urls.slice(0, 5))}`);
    }

    fetchNext() {
        logDebug('UrlList: fetching next url');

        if (this.state.position >= this.urls.length) {
            logInfo('UrlList: all urls fetched');
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
