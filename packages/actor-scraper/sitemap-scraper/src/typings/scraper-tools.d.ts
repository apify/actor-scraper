declare module '@apify/scraper-tools' {
    export interface RequestMetadata {
        depth: number;
        parentRequestId: string | null;
    }

    export const constants: {
        META_KEY: string;
        SESSION_MAX_USAGE_COUNTS: Record<string, number | undefined>;
    };

    export const tools: {
        checkInputOrThrow(input: unknown, schema: object): void;
        ensureMetaData(request: unknown): void;
        createDatasetPayload(
            request: unknown,
            response: unknown,
            pageFunctionResult?: unknown,
            isError?: boolean,
        ): unknown;
    };

    export function runActor(
        CrawlerSetup: new (input: unknown) => {
            name: string;
            createCrawler: () => Promise<{ run(): Promise<unknown> }>;
        },
    ): void;
}
