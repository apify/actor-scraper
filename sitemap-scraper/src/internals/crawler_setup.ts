import { readFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { URL } from 'node:url';

import type {
  AutoscaledPool,
  Awaitable,
  Dictionary,
  HttpCrawlerOptions,
  HttpCrawlingContext,
  InternalHttpCrawlingContext,
  ProxyConfiguration,
  Request,
  RequestOptions,
} from '@crawlee/http';
import {
  Dataset,
  HttpCrawler,
  KeyValueStore,
  log,
  RequestList,
  RequestQueueV2,
} from '@crawlee/http';
import type { ApifyEnv, RequestQueue } from 'apify';
import { Actor } from 'apify';

import type { CrawlerSetupOptions } from '@apify/scraper-tools';
import {
  constants as scraperToolsConstants,
  tools,
} from '@apify/scraper-tools';

import type { Input } from './consts.js';
import { ProxyRotation } from './consts.js';
import { Sitemap } from '@crawlee/utils';

const { SESSION_MAX_USAGE_COUNTS } = scraperToolsConstants;
const SCHEMA = JSON.parse(
  await readFile(new URL('../../INPUT_SCHEMA.json', import.meta.url), 'utf8'),
);

const MAX_EVENT_LOOP_OVERLOADED_RATIO = 0.9;
const SESSION_STORE_NAME = 'APIFY-HTTP-SCRAPER-SESSION-STORE';
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
  evaledPreNavigationHooks: ((...args: unknown[]) => Awaitable<void>)[];
  evaledPostNavigationHooks: ((...args: unknown[]) => Awaitable<void>)[];
  datasetName?: string;
  keyValueStoreName?: string;
  requestQueueName?: string;

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

    // Validations
    this.input.initialCookies.forEach((cookie) => {
      if (!tools.isPlainObject(cookie)) {
        throw new Error(
          'The initialCookies Array must only contain Objects.',
        );
      }
    });

    // solving proxy rotation settings
    this.maxSessionUsageCount =
      SESSION_MAX_USAGE_COUNTS[this.input.proxyRotation];

    if (this.input.preNavigationHooks) {
      this.evaledPreNavigationHooks = tools.evalFunctionArrayOrThrow(
        this.input.preNavigationHooks,
        'preNavigationHooks',
      );
    } else {
      this.evaledPreNavigationHooks = [];
    }

    if (this.input.postNavigationHooks) {
      this.evaledPostNavigationHooks = tools.evalFunctionArrayOrThrow(
        this.input.postNavigationHooks,
        'postNavigationHooks',
      );
    } else {
      this.evaledPostNavigationHooks = [];
    }

    // Named storages
    this.datasetName = this.input.datasetName;
    this.keyValueStoreName = this.input.keyValueStoreName;
    this.requestQueueName = this.input.requestQueueName;

    // Initialize async operations.
    this.crawler = null!;
    this.requestQueue = null!;
    this.dataset = null!;
    this.keyValueStore = null!;
    this.proxyConfiguration = null!;
    this.initPromise = this._initializeAsync();
  }

  private async _initializeAsync() {
    // RequestList
    const startUrls = this.input.startUrls.map((req) => {
      req.useExtendedUniqueKey = true;
      req.keepUrlFragment = this.input.keepUrlFragments;
      return req;
    });

    // KeyValueStore
    this.keyValueStore = await KeyValueStore.open(this.keyValueStoreName);

    // RequestQueue
    this.requestQueue = await RequestQueueV2.open(this.requestQueueName);

    if (
      !(await this.keyValueStore.recordExists(
        REQUEST_QUEUE_INIT_FLAG_KEY,
      ))
    ) {
      const requests: Request[] = [];
      for await (const request of await RequestList.open(
        null,
        startUrls,
      )) {
        if (
          this.input.maxResultsPerCrawl > 0 &&
          requests.length >= 1.5 * this.input.maxResultsPerCrawl
        ) {
          break;
        }
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
    this.dataset = await Dataset.open(this.datasetName);
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
      requestHandler: this._requestHandler.bind(this),
      preNavigationHooks: [],
      postNavigationHooks: [],
      requestQueue: this.requestQueue,
      navigationTimeoutSecs: this.input.pageLoadTimeoutSecs,
      ignoreSslErrors: this.input.ignoreSslErrors,
      failedRequestHandler: this._failedRequestHandler.bind(this),
      respectRobotsTxtFile: this.input.respectRobotsTxtFile,
      maxRequestRetries: this.input.maxRequestRetries,
      maxRequestsPerCrawl:
        this.input.maxPagesPerCrawl === 0
          ? undefined
          : this.input.maxPagesPerCrawl,
      additionalMimeTypes: this.input.additionalMimeTypes,
      autoscaledPoolOptions: {
        maxConcurrency: this.input.maxConcurrency,
        systemStatusOptions: {
          maxEventLoopOverloadedRatio:
            MAX_EVENT_LOOP_OVERLOADED_RATIO,
        },
      },
      useSessionPool: true,
      persistCookiesPerSession: true,
      sessionPoolOptions: {
        persistStateKeyValueStoreId: this.input.sessionPoolName
          ? SESSION_STORE_NAME
          : undefined,
        persistStateKey: this.input.sessionPoolName,
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

    if (this.input.suggestResponseEncoding) {
      if (this.input.forceResponseEncoding) {
        options.forceResponseEncoding =
          this.input.suggestResponseEncoding;
      } else {
        options.suggestResponseEncoding =
          this.input.suggestResponseEncoding;
      }
    }

    this.crawler = new HttpCrawler(options);

    return this.crawler;
  }

  private _createNavigationHooks(options: HttpCrawlerOptions) {
    options.preNavigationHooks!.push(async ({ request, session }) => {
      // Normalize headers
      request.headers = Object.entries(request.headers ?? {}).reduce(
        (newHeaders, [key, value]) => {
          newHeaders[key.toLowerCase()] = value;
          return newHeaders;
        },
        {} as Dictionary<string>,
      );

      // Add initial cookies, if any.
      if (this.input.initialCookies && this.input.initialCookies.length) {
        const cookiesToSet = session
          ? tools.getMissingCookiesFromSession(
            session,
            this.input.initialCookies,
            request.url,
          )
          : this.input.initialCookies;
        if (cookiesToSet?.length) {
          // setting initial cookies that are not already in the session and page
          session?.setCookies(cookiesToSet, request.url);
        }
      }
    });

    options.preNavigationHooks!.push(
      ...this._runHookWithEnhancedContext(this.evaledPreNavigationHooks),
    );
    options.postNavigationHooks!.push(
      ...this._runHookWithEnhancedContext(this.evaledPostNavigationHooks),
    );
  }

  private _runHookWithEnhancedContext(
    hooks: ((...args: unknown[]) => Awaitable<void>)[],
  ) {
    return hooks.map((hook) => (ctx: Dictionary, ...args: unknown[]) => {
      const { customData } = this.input;
      return hook({ ...ctx, Apify: Actor, Actor, customData }, ...args);
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
  protected async _requestHandler(crawlingContext: HttpCrawlingContext) {
    const {
      request,
      response,
      body,
      crawler,
    } = crawlingContext;

    // Make sure that an object containing internal metadata
    // is present on every request.
    tools.ensureMetaData(request);

    // Abort the crawler if the maximum number of results was reached.
    const aborted = await this._handleMaxResultsPerCrawl(
      crawler.autoscaledPool,
    );
    if (aborted) return;

    if (request.method === 'GET') {
      log.info('Processing sitemap', { url: request.url });
      const sitemap = await Sitemap.fromXmlString(body.toString());
      await this.enqueueRequests({
        currentRequest: request,
        requestQueue: this.requestQueue,
        requestsOpts: sitemap.urls.map((url) => ({
          url,
          method: 'HEAD'
        })),
      });
      log.info(`Enqueued ${sitemap.urls.length} URLs from sitemap`, { url: request.url });
      return;
    }

    const result = {
      url: request.url,
      status: response.statusCode,
    }

    // Save the `pageFunction`s result to the default dataset.
    await this._handleResult(
      request,
      response,
      result,
    );
  }

  private async _handleMaxResultsPerCrawl(autoscaledPool?: AutoscaledPool) {
    if (
      !this.input.maxResultsPerCrawl ||
      this.pagesOutputted < this.input.maxResultsPerCrawl
    )
      return false;
    if (!autoscaledPool) return false;
    log.info(
      `User set limit of ${this.input.maxResultsPerCrawl} results was reached.Finishing the crawl.`,
    );
    await autoscaledPool.abort();
    return true;
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

    if (this.pagesOutputted % 100 === 0) {
      log.info(`Pushed ${this.pagesOutputted} items to the dataset so far.`);
    }
    this.pagesOutputted++;
  }

  /**
   * Same as `Context.enqueueRequest`, but works for multiple of them
   */
  async enqueueRequests({
    currentRequest,
    requestQueue,
    requestsOpts,
    options = {},
  }: {
    currentRequest: Request,
    requestQueue: RequestQueue
    requestsOpts: RequestOptions[];
    options?: {};
  }) {
    const defaultRequestOpts = {
      useExtendedUniqueKey: true,
      keepUrlFragment: this.input.keepUrlFragments,
    };
    const defaultUserData = {
      [scraperToolsConstants.META_KEY]: {
        parentRequestId: currentRequest.id || currentRequest.uniqueKey,
        depth: (currentRequest.userData?.[scraperToolsConstants.META_KEY]).depth ?? 0 + 1,
      },
    };

    const newRequests = requestsOpts.map((requestOpts) => ({
      ...defaultRequestOpts,
      ...requestOpts,
      userData: { ...defaultUserData, ...requestOpts.userData },
    }));

    return requestQueue.addRequests(newRequests, options);
  }
}
