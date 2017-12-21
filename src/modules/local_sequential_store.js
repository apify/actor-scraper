/**
 * This is local implementation of sequential store that gets persisted in key-value store.
 */

import _ from 'underscore';
import StatefulClass from './stateful_class';
import { logInfo } from './utils';

const DEFAULT_STATE = {
    currentFileNum: 1,
    currentSeqNum: 1,
    buffer: [],
};

export const STATE_KEY = 'STATE-local-sequential-store.json';

const simplifyResult = ({ pageFunctionResult, url }) => {
    if (_.isArray(pageFunctionResult)) {
        return pageFunctionResult.map((row) => {
            if (_.isObject(row) && !_.isArray(row)) return Object.assign(row, { url });
            return { value: row, url };
        });
    } else if (_.isObject(pageFunctionResult)) {
        return [Object.assign(pageFunctionResult, { url })];
    }

    // It's a scalar value some we must wrap it in object to be able to add url.
    return [{ value: pageFunctionResult, url }];
};

export default class LocalSequentialStore extends StatefulClass {
    constructor(state = DEFAULT_STATE, { maxPagesPerFile, saveSimplifiedResults }) {
        super('LocalSequentialStore', STATE_KEY);

        this.state = state;
        this.maxPagesPerFile = maxPagesPerFile;
        this.saveSimplifiedResults = saveSimplifiedResults;
    }

    put(record) {
        record.outputSeqNum = this.state.currentSeqNum;

        this.state.currentSeqNum++;
        this.state.buffer.push(record);

        if (this.state.buffer.length >= this.maxPagesPerFile) this._outputFile();
    }

    _outputFile() {
        const key = `RESULTS-${this.state.currentFileNum}.json`;
        logInfo(`SequentialStore: outputting file ${key}`);
        this._emitValue({ key, body: this.state.buffer });

        if (this.saveSimplifiedResults) {
            const simplifiedKey = `RESULTS-SIMPLIFIED-${this.state.currentFileNum}.json`;
            const simplifiedResults = this.state.buffer
                .filter(request => request.pageFunctionResult)
                .map(simplifyResult)
                .reduce((acc, result) => acc.concat(result));

            logInfo(`SequentialStore: outputting file ${simplifiedKey}`);
            this._emitValue({
                key: simplifiedKey,
                body: simplifiedResults,
            });
        }

        this.state.currentFileNum++;
        this.state.buffer = [];
    }

    destroy() {
        if (this.state.buffer.length) this._outputFile();
        super.destroy();
    }
}
