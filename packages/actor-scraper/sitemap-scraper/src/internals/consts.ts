import type { Dictionary, RequestOptions } from '@crawlee/http';

/**
 * Replicates the INPUT_SCHEMA with JavaScript types for quick reference
 * and IDE type check integration.
 */
export interface Input {
    startUrls: RequestOptions[];
    keepUrlFragments: boolean;
    respectRobotsTxtFile: boolean;
    pageFunction: string;
    maxRequestRetries: number;
    maxCrawlingDepth: number;
    debugLog: boolean;
    customData: Dictionary;
}
