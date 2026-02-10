declare module '@apify/scraper-tools' {
    type Dictionary = Record<string, any>;

    export interface RequestMetadata {
        depth: number;
        parentRequestId: string | null;
    }

    export const constants: {
        META_KEY: string;
        SESSION_MAX_USAGE_COUNTS: Record<string, number>;
    };

    export const tools: {
        checkInputOrThrow(input: unknown, schema: object): void;
        ensureMetaData(request: unknown): void;
        createDatasetPayload(
            request: unknown,
            response: unknown,
            pageFunctionResult?: Dictionary | Dictionary[],
            isError?: boolean,
        ): Dictionary | Dictionary[];
    };

    export function runActor(
        CrawlerSetup: new (input: any) => {
            name: string;
            createCrawler: () => Promise<{ run(): Promise<unknown> }>;
        },
    ): void;
}
