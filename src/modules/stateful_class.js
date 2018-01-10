/**
 * This is an abstract class with persistent state (this.state) that gets saved into
 * key-value store every STATE_PERSIST_INTERVAL_MILLIS.
 */

import EventEmitter from 'events';
import { logInfo } from './utils';

const STATE_PERSIST_INTERVAL_MILLIS = 180 * 1000;

export const EVENT_VALUE = 'value';

export default class StatefulClass extends EventEmitter {
    constructor(className, stateKey) {
        super();

        this.className = className;
        this.stateKey = stateKey;
        this.statePersisted = false;
        this._setPersistInterval();
    }

    _emitValue(value) {
        this.emit(EVENT_VALUE, value);
    }

    _emitState(deleteState) {
        logInfo(`${this.className}: persisting state`);

        if (this._updateState) this._updateState();

        this._emitValue({
            key: this.stateKey,
            body: deleteState ? null : this.state,
        });

        this.statePersisted = true;
    }

    _setPersistInterval() {
        this.persistInterval = setInterval(() => this._emitState(), STATE_PERSIST_INTERVAL_MILLIS);
    }

    _clearPersistInterval() {
        clearInterval(this.persistInterval);
    }

    async destroy(keepState) {
        this._clearPersistInterval();
        this._emitState(!keepState);
        logInfo(`${this.className}: destroyed`);
    }
}
