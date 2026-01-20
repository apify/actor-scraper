import type {
    Dictionary,
    ProxyConfigurationOptions,
    RequestOptions,
} from '@crawlee/http';

export const enum ProxyRotation {
    Recommended = 'RECOMMENDED',
    PerRequest = 'PER_REQUEST',
    UntilFailure = 'UNTIL_FAILURE',
}

/**
 * Replicates the INPUT_SCHEMA with JavaScript types for quick reference
 * and IDE type check integration.
 */
export interface Input {
    startUrls: RequestOptions[];
    keepUrlFragments: boolean;
    respectRobotsTxtFile: boolean;
    pageFunction: string;
    proxyConfiguration: ProxyConfigurationOptions;
    proxyRotation: ProxyRotation;
    maxRequestRetries: number;
    maxCrawlingDepth: number;
    debugLog: boolean;
    customData: Dictionary;
}
