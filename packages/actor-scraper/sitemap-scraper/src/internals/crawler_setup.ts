import { readFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { URL } from 'node:url';

import type {
    Dictionary,
    HttpCrawlerOptions,
    HttpCrawlingContext,
    InternalHttpCrawlingContext,
    ProxyConfiguration,
    Request,
    RequestOptions,
} from '@crawlee/http';
import {
    createHttpRouter,
    Dataset,
    HttpCrawler,
    KeyValueStore,
    log,
    RequestList,
    RequestQueueV2,
} from '@crawlee/http';
import { discoverValidSitemaps, parseSitemap } from '@crawlee/utils';
import type { ApifyEnv } from 'apify';
import { Actor } from 'apify';

import type {
    CrawlerSetupOptions,
    RequestMetadata,
} from '@apify/scraper-tools';
import {
    constants as scraperToolsConstants,
    tools,
} from '@apify/scraper-tools';

import type { Input } from './consts.js';
import { ProxyRotation } from './consts.js';

const { META_KEY } = scraperToolsConstants;

const { SESSION_MAX_USAGE_COUNTS } = scraperToolsConstants;
const SCHEMA = JSON.parse(
    await readFile(new URL('../../INPUT_SCHEMA.json', import.meta.url), 'utf8'),
);

const REQUESTS_BATCH_SIZE = 25;

const MAX_EVENT_LOOP_OVERLOADED_RATIO = 0.9;
const REQUEST_QUEUE_INIT_FLAG_KEY = 'REQUEST_QUEUE_INITIALIZED';

/**
 * Holds all the information necessary for constructing a crawler
 * instance and creating a context for a pageFunction invocation.
 */
export class CrawlerSetup implements CrawlerSetupOptions {
    name = 'Sitemap Scraper';
    rawInput: string;
    env: ApifyEnv;
    /**
     * Used to store data that persist navigations
     */
    globalStore = new Map();
    requestQueue: RequestQueueV2;
    keyValueStore: KeyValueStore;
    customData: unknown;
    input: Input;
    maxSessionUsageCount: number;
    crawler!: HttpCrawler<InternalHttpCrawlingContext>;
    dataset!: Dataset;
    pagesOutputted!: number;
    proxyConfiguration?: ProxyConfiguration;
    private initPromise: Promise<void>;
    protected readonly schema: object = SCHEMA;

    constructor(input: Input) {
        // Set log level early to prevent missed messages.
        if (input.debugLog) log.setLevel(log.LEVELS.DEBUG);

        // Keep this as string to be immutable.
        this.rawInput = JSON.stringify(input);

        // Validate INPUT if not running on Apify Cloud Platform.
        if (!Actor.isAtHome()) tools.checkInputOrThrow(input, this.schema);

        this.input = input;
        this.env = Actor.getEnv();

        // solving proxy rotation settings
        this.maxSessionUsageCount =
            SESSION_MAX_USAGE_COUNTS[this.input.proxyRotation];

        // Initialize async operations.
        this.crawler = null!;
        this.requestQueue = null!;
        this.dataset = null!;
        this.keyValueStore = null!;
        this.proxyConfiguration = null!;
        this.initPromise = this._initializeAsync();
    }

    private readonly PAGE_LABEL = 'PAGE';

    private _createRequestHandler() {
        const router = createHttpRouter();
        router.addHandler(this.PAGE_LABEL, this._handlePageRequest.bind(this));
        router.addDefaultHandler(this._handleSitemapRequest.bind(this));
        return router;
    }

    private async _initializeAsync() {
        const discoveredSitemaps = await Array.fromAsync(
            discoverValidSitemaps(
                this.input.startUrls
                    .map((x) => x.url)
                    .filter((x) => x !== undefined),
                { proxyUrl: await this.proxyConfiguration?.newUrl() },
            ),
        );
        if (discoveredSitemaps.length === 0) {
            throw await Actor.fail(
                'No valid sitemaps were discovered from the provided startUrls.',
            );
        }

        // RequestList
        const startRequest: RequestOptions[] = [...discoveredSitemaps].map(
            (sitemapUrl) => ({
                url: sitemapUrl,
                useExtendedUniqueKey: true,
                keepUrlFragment: this.input.keepUrlFragments,
                // sitemaps are fetched inside the handler
                skipNavigation: true,
            }),
        );

        // KeyValueStore
        this.keyValueStore = await KeyValueStore.open();

        // RequestQueue
        this.requestQueue = await RequestQueueV2.open();

        if (
            !(await this.keyValueStore.recordExists(
                REQUEST_QUEUE_INIT_FLAG_KEY,
            ))
        ) {
            const requests: Request[] = [];
            for await (const request of await RequestList.open(
                null,
                startRequest,
            )) {
                requests.push(request);
            }

            const { waitForAllRequestsToBeAdded } =
                await this.requestQueue.addRequestsBatched(requests);

            void waitForAllRequestsToBeAdded.then(async () => {
                await this.keyValueStore.setValue(
                    REQUEST_QUEUE_INIT_FLAG_KEY,
                    '1',
                );
            });
        }

        // Dataset
        this.dataset = await Dataset.open();
        const info = await this.dataset.getInfo();
        this.pagesOutputted = info?.itemCount ?? 0;

        // Proxy configuration
        this.proxyConfiguration = (await Actor.createProxyConfiguration(
            this.input.proxyConfiguration,
        )) as any as ProxyConfiguration;
    }

    /**
     * Resolves to a `HttpCrawler` instance.
     */
    async createCrawler() {
        await this.initPromise;

        const options: HttpCrawlerOptions = {
            proxyConfiguration: this.proxyConfiguration,
            requestHandler: this._createRequestHandler(),
            preNavigationHooks: [],
            postNavigationHooks: [],
            requestQueue: this.requestQueue,
            failedRequestHandler: this._failedRequestHandler.bind(this),
            respectRobotsTxtFile: this.input.respectRobotsTxtFile,
            maxRequestRetries: this.input.maxRequestRetries,
            autoscaledPoolOptions: {
                systemStatusOptions: {
                    maxEventLoopOverloadedRatio:
                        MAX_EVENT_LOOP_OVERLOADED_RATIO,
                },
            },
            // this scraper just outputs the returned status code, so we don't treat any as an error
            ignoreHttpErrorStatusCodes: Array.from(
                { length: 100 },
                (_, i) => 500 + i,
            ),
            useSessionPool: true,
            persistCookiesPerSession: true,
            sessionPoolOptions: {
                blockedStatusCodes: [],
                sessionOptions: {
                    maxUsageCount: this.maxSessionUsageCount,
                },
            },
            experiments: {
                requestLocking: true,
            },
        };

        this._createNavigationHooks(options);

        if (this.input.proxyRotation === ProxyRotation.UntilFailure) {
            options.sessionPoolOptions!.maxPoolSize = 1;
        }

        this.crawler = new HttpCrawler(options);

        return this.crawler;
    }

    private _createNavigationHooks(options: HttpCrawlerOptions) {
        options.preNavigationHooks!.push(async ({ request }) => {
            // Normalize headers
            request.headers = Object.entries(request.headers ?? {}).reduce(
                (newHeaders, [key, value]) => {
                    newHeaders[key.toLowerCase()] = value;
                    return newHeaders;
                },
                {} as Dictionary<string>,
            );
        });
    }

    private async _failedRequestHandler({ request }: HttpCrawlingContext) {
        const lastError =
            request.errorMessages[request.errorMessages.length - 1];
        const errorMessage = lastError ? lastError.split('\n')[0] : 'no error';
        log.error(
            `Request ${request.url} failed and will not be retried anymore. Marking as failed.\nLast Error Message: ${errorMessage}`,
        );
        return this._handleResult(request, undefined, undefined, true);
    }

    /**
     * Parses the sitemap if it's one and enqueues HEAD requests. Otherwise pushes
     * the response data to the dataset.
     */
    protected async _handleSitemapRequest(
        crawlingContext: HttpCrawlingContext,
    ) {
        const { request } = crawlingContext;

        // Make sure that an object containing internal metadata
        // is present on every request.
        tools.ensureMetaData(request);

        log.info('Processing sitemap', { url: request.url });
        const parsed = parseSitemap(
            [{ type: 'url', url: request.url }],
            await this.proxyConfiguration?.newUrl(),
            {
                emitNestedSitemaps: true,
                maxDepth: 0,
            },
        );

        const nestedSitemaps: string[] = [];
        const urls: string[] = [];
        let scrapedAnyPageUrls = false;
        let scrapedAnySitemapUrls = false;

        const flushUrls = async () => {
            if (urls.length === 0) return;
            await this._enqueuePageRequests(urls, crawlingContext);
            urls.length = 0;
        };

        const flushSitemaps = async () => {
            if (nestedSitemaps.length === 0) return;
            await this._enqueueSitemapRequests(nestedSitemaps, crawlingContext);
            nestedSitemaps.length = 0;
        };
        for await (const item of parsed) {
            if (!item.originSitemapUrl) {
                log.debug('Handling nested sitemap', {
                    url: item.loc,
                });

                nestedSitemaps.push(item.loc);
                scrapedAnySitemapUrls = true;
            } else {
                log.debug('Handling url from sitemap', {
                    url: item.loc,
                });

                urls.push(item.loc);
                scrapedAnyPageUrls = true;
            }

            if (nestedSitemaps.length >= REQUESTS_BATCH_SIZE) {
                await flushSitemaps();
            }

            if (urls.length >= REQUESTS_BATCH_SIZE) {
                await flushUrls();
            }
        }

        await flushSitemaps();
        await flushUrls();

        const { hasReachedMaxDepth, currentDepth } =
            this._hasSitemapReachedMaxDepth(request);
        if (
            hasReachedMaxDepth &&
            !scrapedAnyPageUrls &&
            scrapedAnySitemapUrls
        ) {
            log.warning(
                "Reached max depth limit at a sitemap containing only sitemaps. Increase your `maxCrawlingDepth` if this wasn't intended",
                {
                    sitemapUrl: request.url,
                    currentDepth,
                },
            );
        }
    }

    protected async _handlePageRequest(crawlingContext: HttpCrawlingContext) {
        const { request, response } = crawlingContext;

        // Make sure that an object containing internal metadata
        // is present on every request.
        tools.ensureMetaData(request);

        const result = {
            url: request.url,
            status: response.statusCode,
        };

        // Save the `pageFunction`s result to the default dataset.
        await this._handleResult(request, response, result);
    }

    private async _handleResult(
        request: Request,
        response?: IncomingMessage,
        pageFunctionResult?: Dictionary,
        isError?: boolean,
    ) {
        const payload = tools.createDatasetPayload(
            request,
            response,
            pageFunctionResult,
            isError,
        );
        await this.dataset.pushData(payload);

        if (this.pagesOutputted > 0 && this.pagesOutputted % 100 === 0) {
            log.info(
                `Pushed ${this.pagesOutputted} items to the dataset so far.`,
            );
        }
        this.pagesOutputted++;
    }

    private _hasSitemapReachedMaxDepth(request: Request): {
        hasReachedMaxDepth: boolean;
        currentDepth: number;
    } {
        /**
         * The depth of the parent sitemap
         */
        const currentDepth = (request.userData[META_KEY] as RequestMetadata)
            .depth;
        const hasReachedMaxDepth =
            this.input.maxCrawlingDepth &&
            currentDepth + 1 >= this.input.maxCrawlingDepth;
        return {
            hasReachedMaxDepth: Boolean(hasReachedMaxDepth),
            currentDepth,
        };
    }

    private async _enqueueSitemapRequests(
        urls: string[],
        { request, enqueueLinks }: HttpCrawlingContext,
    ): Promise<{
        reachedMaxDepth: boolean;
    }> {
        const { hasReachedMaxDepth, currentDepth } =
            this._hasSitemapReachedMaxDepth(request);
        if (hasReachedMaxDepth) {
            log.debug(
                `Request ${request.url} reached the maximum crawling depth of ${currentDepth}.`,
            );
            return {
                reachedMaxDepth: true,
            };
        }

        await enqueueLinks({
            urls,
            transformRequestFunction: (requestOptions) => {
                requestOptions.userData ??= {};
                requestOptions.userData[META_KEY] = {
                    parentRequestId: request.id || request.uniqueKey,
                    depth: currentDepth + 1,
                };

                requestOptions.useExtendedUniqueKey = true;
                requestOptions.keepUrlFragment = this.input.keepUrlFragments;
                return requestOptions;
            },
        });

        return {
            reachedMaxDepth: false,
        };
    }

    private async _enqueuePageRequests(
        urls: string[],
        { request, enqueueLinks }: HttpCrawlingContext,
    ) {
        const currentDepth = (request.userData![META_KEY] as RequestMetadata)
            .depth;

        // NOTE: depth check when enqueueing pages is not needed, since the one
        // for sitemaps will do the job

        await enqueueLinks({
            urls,
            label: this.PAGE_LABEL,
            transformRequestFunction: (requestOptions) => {
                requestOptions.userData ??= {};
                requestOptions.userData[META_KEY] = {
                    parentRequestId: request.id || request.uniqueKey,
                    depth: currentDepth + 1,
                };

                requestOptions.useExtendedUniqueKey = true;
                requestOptions.keepUrlFragment = this.input.keepUrlFragments;
                requestOptions.method = 'HEAD';
                return requestOptions;
            },
        });
    }
}
