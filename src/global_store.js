/**
 * GlobalStore is a trivial storage that can be used both in Node and Browser contexts
 * to retain data through page navigations and browser instances.
 */
class GlobalStore {
    constructor() {
        this.store = Object.create(null);
    }

    get(key) {
        if (typeof key !== 'string') throw new Error('GlobalStore#get parameter "key" must be a string.');
        return this.store[key];
    }

    set(key, value) {
        if (typeof key !== 'string') throw new Error('GlobalStore#set parameter "key" must be a string.');
        this.store[key] = value;
    }

    size() {
        return Object.keys(this.store).length;
    }
}

module.exports = GlobalStore;
