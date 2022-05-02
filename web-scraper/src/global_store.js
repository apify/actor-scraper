/**
 * GlobalStore is a trivial storage that resembles a Map to be used from Browser contexts
 * to retain data through page navigations and browser instances. It limits Map's functionality
 * because it's currently impossible for functions and object references to cross Node-Browser threshold.
 */
class GlobalStore extends Map {
    get(key) {
        if (typeof key !== 'string') throw new Error('GlobalStore#get parameter "key" must be a string.');
        return super.get(key);
    }

    set(key, value) {
        if (typeof key !== 'string') throw new Error('GlobalStore#set parameter "key" must be a string.');
        return super.set(key, value);
    }

    forEach() {
        throw new Error('GlobalStore#forEach function is not available due to underlying technology limitations.');
    }

    values() {
        return Array.from(super.values());
    }

    keys() {
        return Array.from(super.keys());
    }

    entries() {
        return Array.from(super.entries());
    }

    get size() {
        return super.size;
    }
}

module.exports = GlobalStore;
