import { Request } from '@crawlee/core';

import type { CrawlerSetupOptions } from '@apify/scraper-tools';
import { constants, createContext } from '@apify/scraper-tools';

const { META_KEY } = constants;

function createTestContext(request: Request) {
    const addRequest = vi.fn(async (req: unknown) => req);
    const crawlerSetup = {
        rawInput: '{}',
        env: {},
        globalStore: new Map<string, unknown>(),
        requestQueue: { addRequest },
        keyValueStore: {},
        customData: null,
    } as unknown as CrawlerSetupOptions;
    const { context } = createContext({ crawlerSetup, pageFunctionArguments: { request } });
    return { context, addRequest };
}

describe('Context.enqueueRequest()', () => {
    it('increments the crawling depth of the parent request', async () => {
        const request = new Request({ url: 'https://www.example.com/parent' });
        request.userData[META_KEY] = { depth: 2, parentRequestId: null };
        const { context, addRequest } = createTestContext(request);

        await context.enqueueRequest({ url: 'https://www.example.com/child' });

        expect(addRequest).toHaveBeenCalledTimes(1);
        const enqueued = addRequest.mock.calls[0][0] as { userData: Record<string, { depth: number }> };
        expect(enqueued.userData[META_KEY].depth).toBe(3);
    });

    it('starts at depth 1 when the parent request has no metadata', async () => {
        const request = new Request({ url: 'https://www.example.com/parent' });
        const { context, addRequest } = createTestContext(request);

        await context.enqueueRequest({ url: 'https://www.example.com/child' });

        const enqueued = addRequest.mock.calls[0][0] as { userData: Record<string, { depth: number }> };
        expect(enqueued.userData[META_KEY].depth).toBe(1);
    });

    it('links the enqueued request to its parent', async () => {
        const request = new Request({ url: 'https://www.example.com/parent' });
        const { context, addRequest } = createTestContext(request);

        await context.enqueueRequest({ url: 'https://www.example.com/child' });

        const enqueued = addRequest.mock.calls[0][0] as {
            userData: Record<string, { parentRequestId: string | null }>;
        };
        expect(enqueued.userData[META_KEY].parentRequestId).toBe(request.uniqueKey);
    });
});
