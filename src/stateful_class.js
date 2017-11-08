import EventEmitter from 'events';
import { logDebug } from './utils';

const STATE_PERSIST_INTERVAL_MILLIS = 1000;

export default class StatefulClass extends EventEmitter {
    constructor(className, stateKey) {
        super();

        this.className = className;
        this.stateKey = stateKey;
        this._setPersistInterval();
    }

    _emitState(state) {
        logDebug(`${this.className}: persisting state`);

        this.emit('value', {
            key: this.stateKey,
            body: state,
        });
    }

    _setPersistInterval() {
        this.persistInterval = setInterval(() => this._emitState(this.state), STATE_PERSIST_INTERVAL_MILLIS);
    }

    _clearPersistInterval() {
        clearInterval(this.persistInterval);
    }

    destroy() {
        this._clearPersistInterval();
        this._emitState(null);
        logDebug(`${this.className}: destroyed`);
    }
}
