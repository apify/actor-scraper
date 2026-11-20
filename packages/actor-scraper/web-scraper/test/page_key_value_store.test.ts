import type { KeyValueStore } from '@crawlee/puppeteer';
import { describe, expect, it, vi } from 'vitest';

import { createPageKeyValueStore } from '../src/internals/page_key_value_store';

describe('createPageKeyValueStore', () => {
    it("refuses only the scraper's own records", async () => {
        const store = { getValue: vi.fn(async () => 'stored'), setValue: vi.fn() };
        const pageStore = createPageKeyValueStore(store as unknown as KeyValueStore, ['INPUT']);

        for (const key of [
            'INPUT',
            'input',
            'INPUT.json',
            'SDK_SESSION_POOL_STATE',
            'crawlee_state',
            'a.__metadata__',
            '__metadata__',
        ]) {
            await expect(pageStore.getValue(key)).rejects.toThrow(`Key "${key}" is reserved`);
            await expect(pageStore.setValue(key, 'forged')).rejects.toThrow(`Key "${key}" is reserved`);
        }
        expect(store.getValue).not.toHaveBeenCalled();
        expect(store.setValue).not.toHaveBeenCalled();

        for (const key of ['input-urls', 'my__metadata__notes']) {
            await pageStore.setValue(key, { a: 1 });
            expect(store.setValue).toHaveBeenCalledWith(key, { a: 1 }, undefined);
            await expect(pageStore.getValue(key)).resolves.toBe('stored');
        }
    });
});
