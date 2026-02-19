declare module '@apify/scraper-tools' {
    export const constants: {
        META_KEY: string;
        SESSION_MAX_USAGE_COUNTS: Record<string, number>;
        [key: string]: unknown;
    };

    export const tools: {
        checkInputOrThrow(input: unknown, schema: object): void;
        ensureMetaData(request: unknown): void;
        createDatasetPayload(
            request: unknown,
            response?: unknown,
            pageFunctionResult?: unknown,
            isError?: boolean,
        ): any;
        [key: string]: unknown;
    };

    export function runActor(
        crawlerSetupClass: new (input: any) => {
            name: string;
            createCrawler(): Promise<{ run(): Promise<unknown> }>;
        },
    ): Promise<void>;
}
