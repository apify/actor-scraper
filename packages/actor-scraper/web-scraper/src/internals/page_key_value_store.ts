import type { KeyValueStore, RecordOptions } from '@crawlee/puppeteer';

const RESERVED_KEY_PREFIXES = ['SDK_', 'CRAWLEE_'];
const METADATA_SEGMENT = /(^|\.)__METADATA__(\.|$)/;

/**
 * The key-value store as the page function gets it. The site's own scripts run in the same page, so the scraper's
 * records are out of their reach: the scraper reads them back on restart, the input holds proxy passwords and the
 * session pool state holds cookies.
 */
export function createPageKeyValueStore(store: KeyValueStore, reservedKeys: string[]) {
    const reserved = reservedKeys.map((key) => key.toUpperCase());

    // Local storage on disk maps more keys onto a record's file: `input` on a case-insensitive file system,
    // `INPUT.json` through its extension, and a key with a `__metadata__` segment lands in a metadata file,
    // which can point any record at any file.
    const assertNotReserved = (key: string) => {
        const upperCaseKey = key.toUpperCase();
        if (
            reserved.some(
                (reservedKey) => upperCaseKey === reservedKey || upperCaseKey.startsWith(`${reservedKey}.`),
            ) ||
            RESERVED_KEY_PREFIXES.some((prefix) => upperCaseKey.startsWith(prefix)) ||
            METADATA_SEGMENT.test(upperCaseKey)
        ) {
            throw new Error(`Key "${key}" is reserved by the scraper and cannot be used from the page function.`);
        }
    };

    return {
        async getValue(key: string, defaultValue?: unknown) {
            assertNotReserved(key);
            return store.getValue(key, defaultValue);
        },
        async setValue(key: string, value: unknown, options?: RecordOptions) {
            assertNotReserved(key);
            return store.setValue(key, value, options);
        },
    };
}
