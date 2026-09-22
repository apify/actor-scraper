import { Configuration } from 'apify';
import { describe, expect, it } from 'vitest';

describe('Apify and Crawlee runtime compatibility', () => {
    it('initializes the global Apify configuration', () => {
        expect(() => Configuration.getGlobalConfig()).not.toThrow();
    });
});
