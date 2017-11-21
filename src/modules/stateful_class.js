import EventEmitter from 'events';
import { logDebug } from './utils';

const STATE_PERSIST_INTERVAL_MILLIS = 15000;

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

    _emitState(state) {
        logDebug(`${this.className}: persisting state`);

        this._emitValue({
            key: this.stateKey,
            body: state,
        });

        this.statePersisted = true;
    }

    _setPersistInterval() {
        this.persistInterval = setInterval(() => this._emitState(this.state), STATE_PERSIST_INTERVAL_MILLIS);
    }

    _clearPersistInterval() {
        clearInterval(this.persistInterval);
    }

    destroy() {
        this._clearPersistInterval();
        // TODO: uncomment - if (this.statePersisted) this._emitState(null);
        logDebug(`${this.className}: destroyed`);
    }
}
