/**
 * This is local implementation of sequential store that gets persisted in key-value store.
 */

import StatefulClass from './stateful_class';
import { logInfo } from './utils';

const DEFAULT_STATE = {
    currentFileNum: 1,
    currentSeqNum: 1,
    buffer: [],
};

export const STATE_KEY = 'STATE-local-sequential-store.json';

export default class LocalSequentialStore extends StatefulClass {
    constructor(state = DEFAULT_STATE, { maxPagesPerFile, saveSimplifiedResults }) {
        super('LocalSequentialStore', STATE_KEY);

        this.state = state;
        this.maxPagesPerFile = maxPagesPerFile;
        this.saveSimplifiedResults = saveSimplifiedResults
    }

    put(record) {
        record.outputSeqNum = this.state.currentSeqNum;

        this.state.currentSeqNum ++;
        this.state.buffer.push(record);

        if (this.state.buffer.length >= this.maxPagesPerFile) this._outputFile();
    }

    _outputFile() {
        const key = `RESULTS-${this.state.currentFileNum}.json`;

        logInfo(`SequentialStore: outputting file ${key}`);

        this._emitValue({ key, body: this.state.buffer });
        
        if(this.saveSimplifiedResults){
            const simplifiedKey = `RESULTS-SIMPLIFIED-${this.state.currentFileNum}.json`;
            logInfo(`SequentialStore: outputting file ${simplifiedKey}`);

            const transformResults = (pageFunctionResult, url) => {
                let pageResults = []
                if(Array.isArray(pageFunctionResult)){
                    pageResults = pageFunctionResult.map(pfResult=>{
                        if(typeof pfResult === 'object' && !Array.isArray(pfResult)) return Object.assign(pfResult, {url})
                        else return {result: pfResult, url}
                    })
                }
                else if(typeof pageFunctionResult === 'object' && !Array.isArray(pageFunctionResult)){     
                    pageResults.push(Object.assign(pageFunctionResult, {url}))
                }
                else{
                    pageResults.push({result: pageFunctionResult, url})
                }
                return pageResults
            }

            const simplifiedResults = this.state.buffer.reduce((acc, result)=>{          
                return acc.concat(transformResults(result.pageFunctionResult, result.loadedUrl))
            },[])

            this._emitValue({ 
                simplifiedKey,
                body: simplifiedResults
            });
        }

        this.state.currentFileNum ++;
        this.state.buffer = [];
    }

    destroy() {
        if (this.state.buffer.length) this._outputFile();
        super.destroy();
    }
}
