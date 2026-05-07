## What is Cheerio Scraper?

It's a fast, server-side scraper that pulls plain HTML over HTTP and parses it with [Cheerio](https://cheerio.js.org) — the server-side equivalent of [jQuery](https://jquery.com). No browser, no client-side JavaScript: just the raw HTML response and a familiar selector API. With Cheerio Scraper, you can:

⚡ Run **up to 20× faster** than full-browser scrapers — no Chrome to spin up

🧩 Use **jQuery-style selectors** via [Cheerio](https://cheerio.js.org) to extract any data from the parsed DOM

🔗 **Crawl recursively** with Link selector, Glob Patterns, and Pseudo-URLs — pagination, sitemaps, full-site crawls

🛠 Write a **custom page function** in JavaScript to extract data and steer the crawl

📦 Export results as **JSON, CSV, XML, Excel, or HTML**, or pull them via the [Apify API](https://docs.apify.com/api/v2)

🔌 Plug into **Make, Zapier, webhooks, MCP servers**, and the rest of [Apify's integrations](https://apify.com/integrations)

🪪 Fork the [**open-source Actor**](https://github.com/apify/actor-scraper/tree/master/packages/actor-scraper/cheerio-scraper) on GitHub, or build your own with Crawlee's [`CheerioCrawler`](https://crawlee.dev/js/api/cheerio-crawler)

Cheerio Scraper is built for technical users comfortable with [jQuery](https://jquery.com) and Cheerio, and works on **static HTML pages**. For pages that render content with client-side JavaScript, reach for a browser-based scraper instead — [**Web Scraper**](https://apify.com/apify/web-scraper), [**Puppeteer Scraper**](https://apify.com/apify/puppeteer-scraper), or [**Playwright Scraper**](https://apify.com/apify/playwright-scraper). If you're not a developer, [**AI Web Scraper**](https://apify.com/apify/ai-web-scraper) lets you describe what to extract in plain English — no page function required. To learn Cheerio Scraper step by step, follow the [**Scraping with Cheerio Scraper**](https://docs.apify.com/academy/apify-scrapers/cheerio-scraper) tutorial in the Apify Academy.

## Cost of usage

Cheerio Scraper is billed by [platform usage](https://apify.com/pricing) (compute units, storage operations, data transfer) rather than a flat per-result fee, so the exact cost of a run is hard to predict. It depends on **how many pages you crawl**, **how rich your page function is**, **how many links each page produces**, **page size**, **proxy choice**, and **memory allocation**. Treat the numbers below as illustrative samples, not a guaranteed price — for your own use case, run a small test first and extrapolate.

For a quick orientation, the [pricing page](https://apify.com/pricing) lists average estimates under `Which plan do I need?`. Cheerio Scraper is equivalent to `Simple HTML pages`; Web Scraper, Puppeteer Scraper and Playwright Scraper are equivalent to `Full web pages`.

### Sample runs

Both samples below crawled the same site ([`docs.apify.com`](https://docs.apify.com)) on default settings (1024 MB memory, Apify Proxy, concurrency 50). They differ in page-function complexity and crawl size.

| Sample                                  | Pages | Page function                                                                            | Runtime  | Compute units | Total cost |
|-----------------------------------------|------:|------------------------------------------------------------------------------------------|---------:|--------------:|-----------:|
| Lightweight (title, h1, meta description) | 237   | 4 selectors                                                                              | 3 min 15 s | 0.054 CU      | **$0.024** |
| Heavier (all h2/h3, internal link list, code-block count, word count) | 485   | 8+ selectors plus body word count                                                        | 6 min 38 s | 0.111 CU      | **$0.048** |

Both samples worked out to roughly **$0.0001 per result** (~$0.10 per 1,000 results) on this site. Cost is dominated by compute units (~46%) and request-queue writes (~40%). On heavier sites — large pages, long link graphs, residential proxy, slower responses — the per-result figure can be several times higher, so use these numbers as a starting point only.

## Usage

To get started with Cheerio Scraper, you only need two things. First, tell the scraper which web pages
it should load. Second, tell it how to extract data from each page.

The scraper starts by loading the pages specified in the [**Start URLs**](#start-urls) field.
You can make the scraper follow page links on the fly by setting a [**Link selector**](#link-selector), **[Glob Patterns](#glob-patterns)** and/or **[Pseudo-URLs](#pseudo-urls)** to tell the scraper which links it should add to the crawling queue. This is useful for the recursive crawling of entire websites, e.g. to find all products in an online store.

To tell the scraper how to extract data from web pages, you need to provide a [**Page function**](#page-function). This is JavaScript code that is executed for every web page loaded. Since the scraper does not use the full web browser, writing the **Page function** is equivalent to writing server-side Node.js code - it uses the server-side library [Cheerio](https://cheerio.js.org).

In summary, Cheerio Scraper works as follows:

1. Adds each [Start URL](#start-urls) to the crawling queue.
2. Fetches the first URL from the queue and constructs a DOM from the fetched HTML string.
3. Executes the [**Page function**](#page-function) on the loaded page and saves its results.
4. Optionally, finds all links from the page using the [**Link selector**](#link-selector).
   If a link matches any of the **[Glob Patterns](#glob-patterns)** and/or **[Pseudo-URLs](#pseudo-urls)** and has not yet been visited, adds it to the queue.
5. If there are more items in the queue, repeats step 2, otherwise finishes.

Cheerio Scraper has a number of advanced configuration settings to improve performance, set cookies for login to websites, limit the number of records, etc. See their tooltips for more information.

Under the hood, Cheerio Scraper is built using the [`CheerioCrawler`](https://crawlee.dev/api/cheerio-crawler/class/CheerioCrawler) class
from Crawlee. If you'd like to learn more about the inner workings of the scraper, see the respective documentation.

## Limitations

The Actor does not employ a full-featured web browser such as Chromium or Firefox, so it will not be sufficient for web pages that render their content dynamically using client-side JavaScript. To scrape such sites, you might prefer to use [**Web Scraper**](https://apify.com/apify/web-scraper) (`apify/web-scraper`), which loads pages in a full browser and renders dynamic content.

Since Cheerio Scraper's **Page function** is executed in the context of the server, it only supports server-side code running in Node.js. If you need to combine client- and server-side libraries in Chromium using the [Puppeteer](https://github.com/puppeteer/puppeteer) library, you might prefer to use
[**Puppeteer Scraper**](https://apify.com/apify/puppeteer-scraper) (`apify/puppeteer-scraper`). If you prefer Firefox and/or [Playwright](https://github.com/microsoft/playwright), check out [**Playwright Scraper**](https://apify.com/apify/playwright-scraper) (`apify/playwright-scraper`). For even more flexibility and control, you might develop a new Actor from scratch in Node.js using [Apify SDK](https://sdk.apify.com/) and [Crawlee](https://crawlee.dev).

In the [**Page function**](#page-function) and **Prepare request function**,
you can only use npm modules that are already installed in this Actor.
If you require other modules for your scraping, you'll need to develop a completely new Actor.
You can use the [`CheerioCrawler`](https://crawlee.dev/api/cheerio-crawler/class/CheerioCrawler) class
from Crawlee to get most of the functionality of Cheerio Scraper out of the box.

Don't know how to code a page function? The [**AI Web Scraper**](https://apify.com/apify/ai-web-scraper) lets you describe what to extract in plain English instead — no JavaScript required.

## Input configuration

As input, Cheerio Scraper Actor accepts a number of configurations. These can be entered either manually in the user interface in [Apify Console](https://console.apify.com), or programmatically in a JSON object using the [Apify API](https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor). For a complete list of input fields and their types, please visit the [Input](https://apify.com/apify/cheerio-scraper/input-schema) tab.

### Start URLs

The **Start URLs** (`startUrls`) field represents the initial list of pages that the scraper will visit.
You can either enter the URLs manually one by one, upload them in a CSV file, or [link URLs from a Google Sheet](https://help.apify.com/en/articles/2906022-scraping-a-list-of-urls-from-a-google-sheets-document) document.
Each URL must start with either a `http://` or `https://` protocol prefix.

The scraper supports adding new URLs to scrape on the fly, either using the [**Link selector**](#link-selector) and **[Glob Patterns](#glob-patterns)**/**[Pseudo-URLs](#pseudo-urls)** options or by calling `context.enqueueRequest()` inside the [**Page function**](#page-function).

Optionally, each URL can be associated with custom user data - a JSON object that can be referenced from
your JavaScript code in the [**Page function**](#page-function) under `context.request.userData`.
This is useful for determining which start URL is currently loaded, in order to perform some page-specific actions. For example, when crawling an online store, you might want to perform different actions on a page listing the products vs. a product detail page. For details, see the [**Web scraping tutorial**](https://docs.apify.com/tutorials/apify-scrapers/getting-started#the-start-url) in the Apify documentation.

Cheerio Scraper uses an Apify [request queue](https://docs.apify.com/platform/storage/request-queue) to track the URLs it has loaded and the URLs it still needs to load. Each request is identified by a `uniqueKey` — by default the request URL, with the URL fragment (`#...`) stripped unless the **Keep URL fragments** option is enabled. Requests whose `uniqueKey` has already been seen are skipped, so the same page isn't loaded twice. You can override `uniqueKey` per request when calling `context.enqueueRequest()` from the page function — useful when you need to scrape the same URL multiple times with different `userData`.

### Link selector

The **Link selector** (`linkSelector`) field contains a CSS selector that is used to find links to other web pages, i.e. `<a>` elements with the `href` attribute. On every page loaded, the scraper looks for all links matching the **Link selector**. It checks that the target URL matches one of the [**Glob Patterns**](#glob-patterns)/[**Pseudo-URLs**](#pseudo-urls), and if so then adds the URL to the request queue, to be loaded by the scraper later.

By default, new scrapers are created with the following selector that matches all links:

```
a[href]
```

If the **Link selector** is empty, page links are ignored, and the scraper only loads pages that were specified in the [**Start URLs**](#start-urls) input or that were manually added to the request queue by calling `context.enqueueRequest()` in the [**Page function**](#page-function).

### Glob Patterns

The **Glob Patterns** (`globs`) field specifies which types of URLs found by **[Link selector](#link-selector)** should be added to the request queue.

A glob pattern is simply a string with wildcard characters.

For example, a glob pattern `http://www.example.com/pages/**/*` will match all the
following URLs:

- `http://www.example.com/pages/deeper-level/page`
- `http://www.example.com/pages/my-awesome-page`
- `http://www.example.com/pages/something`

Note that you don't need to use the **Glob Patterns** setting at all, because you can completely control which pages the scraper will access by calling `await context.enqueueRequest()` from the **[Page function](#page-function)**.

### Pseudo-URLs

The **Pseudo-URLs** (`pseudoUrls`) field specifies which types of URLs found by **[Link selector](#link-selector)** should be added to the request queue.

A pseudo-URL is simply a URL with special directives enclosed in `[]` brackets.
Currently, the only supported directive is `[regexp]`, which defines
a JavaScript-style regular expression to match against the URL.

For example, a pseudo-URL `http://www.example.com/pages/[(\w|-)*]` will match all the
following URLs:

- `http://www.example.com/pages/`
- `http://www.example.com/pages/my-awesome-page`
- `http://www.example.com/pages/something`

If either "`[`" or "`]`" are part of the normal query string, the symbol must be encoded as `[\x5B]` or `[\x5D]`, respectively. For example, the following pseudo-URL:

```
http://www.example.com/search?do[\x5B]load[\x5D]=1
```

will match the URL:

```
http://www.example.com/search?do[load]=1
```

Optionally, each pseudo-URL can be associated with user data that can be referenced from your **[Page function](#page-function)**
using `context.request.label` to determine which kind of page is currently loaded in the browser.

Note that you don't need to use the **Pseudo-URLs** setting at all,
because you can completely control which pages the scraper will access by calling `await context.enqueueRequest()`
from the **[Page function](#page-function)**.

### Content types

By default, Cheerio Scraper only processes web pages with the `text/html`, `application/json`, `application/xml`, `application/xhtml+xml` MIME content types (as reported by the `Content-Type` HTTP header),
and skips pages with other content types. This is an edge-case setting — most users won't need to change it. The most common reason to do so is when paginating through endpoints that return non-default content types (for example, a JSON API that drives the listing pages).

If you want the crawler to process other content types,
use the **Additional MIME types** (`additionalMimeTypes`) input option.

Note that while the default `Accept` HTTP header will allow any content type to be received,
HTML and XML are preferred over JSON and other types. Thus, if you're allowing additional MIME
types, and you're still receiving invalid responses, be sure to override the `Accept`
HTTP header setting in the requests from the scraper,
either in [**Start URLs**](#start-urls), [**Pseudo URLs**](#pseudo-urls) or in the **Prepare request function**.

The web pages with various content types are parsed differently and
thus the `context` parameter of the [**Page function**](#page-function) will have different values:

| **Content types**                                       | [`context.body`](#body-stringbuffer) | [`context.$`](#-function) | [`context.json`](#json-object) |
| ------------------------------------------------------- | ------------------------------------ | ------------------------- | ------------------------------ |
| `text/html`, `application/xhtml+xml`, `application/xml` | `String`                             | `Function`                | `null`                         |
| `application/json`                                      | `String`                             | `null`                    | `Object`                       |
| Other                                                   | `Buffer`                             | `null`                    | `null`                         |

The `Content-Type` HTTP header of the web page is parsed using the
<a href="https://www.npmjs.com/package/content-type" target="_blank">content-type</a> npm package
and the result is stored in the [`context.contentType`](#contenttype-object) object.

### Page function

The **Page function** (`pageFunction`) field contains a single JavaScript function that enables the user to extract data from the web page, access its DOM, add new URLs to the request queue, and otherwise control Cheerio Scraper's operation.

Example:

```javascript
async function pageFunction(context) {
    const { $, request, log } = context;

    // The "$" property contains the Cheerio object which is useful
    // for querying DOM elements and extracting data from them.
    const pageTitle = $('title').first().text();

    // The "request" property contains various information about the web page loaded.
    const url = request.url;

    // Use "log" object to print information to Actor log.
    log.info('Page scraped', { url, pageTitle });

    // Return an object with the data extracted from the page.
    // It will be stored to the resulting dataset.
    return {
        url,
        pageTitle,
    };
}
```

The code runs in [Node.js 16](https://nodejs.org/) and the function accepts a single argument, the `context` object, whose properties are listed below.

The return value of the page function is an object (or an array of objects) representing the data extracted from the web page. The return value must be stringify-able to JSON, i.e. it can only contain basic types and no circular references. If you prefer not to extract any data from the page and skip it in the clean results, simply return `null` or `undefined`.

The **Page function** supports the JavaScript ES6 syntax and is asynchronous, which means you can use the `await` keyword to wait for background operations to finish. To learn more about `async` functions,
visit the [Mozilla documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function).

**Properties of the `context` object:**

- ##### **`$: Function`**

    A reference to the [Cheerio](https://cheerio.js.org/)'s function representing the root scope of the DOM
    of the current HTML page.

    This function is the starting point for traversing the DOM document and extracting data from it.
    Like with [jQuery](https://jquery.com/), it is the primary method for selecting elements in the document,
    but unlike jQuery it is built on top of the [`css-select`](https://www.npmjs.com/package/css-select) library,
    which implements most of the [`Sizzle`](https://github.com/jquery/sizzle/wiki) selectors.

    For more information, see the [Cheerio](https://cheerio.js.org/) documentation.

    Example:

    ```html
    <ul id="movies">
        <li class="fun-movie">Fun Movie</li>
        <li class="sad-movie">Sad Movie</li>
        <li class="horror-movie">Horror Movie</li>
    </ul>
    ```

    ```javascript
    $('#movies', '.fun-movie').text();
    //=> Fun Movie
    $('ul .sad-movie').attr('class');
    //=> sad-movie
    $('li[class=horror-movie]').html();
    //=> Horror Movie
    ```

- ##### **`Actor: Object`**

    A reference to the [Actor](https://sdk.apify.com/api/apify/class/Actor) object from [Apify SDK](https://sdk.apify.com/).
    This is equivalent to:

    ```javascript
    import { Actor } from 'apify';
    ```

- ##### **`Apify: Object`**

    A reference to the [Actor](https://sdk.apify.com/api/apify/class/Actor) object from [Apify SDK](https://sdk.apify.com/). Included for backward compatibility.

- ##### **`crawler: Object`**

    A reference to the `CheerioCrawler` object, see [Crawlee docs](https://crawlee.dev/api/cheerio-crawler/class/CheerioCrawler) for more information.

- ##### **`body: String|Buffer`**

    The body from the target web page. If the web page is in HTML or XML format, the `body` will be a string that contains the HTML or XML content.
    In other cases, the `body` with be a [Buffer](https://nodejs.org/api/buffer.html).
    If you need to process the `body` as a string, you can use the information from `contentType` property to convert
    the binary data into a string.

    Example:

    ```javascript
    const stringBody = context.body.toString(context.contentType.encoding);
    ```

- ##### **`cheerio: Object`**

    Reference to the [`Cheerio`](https://cheerio.js.org) module. Being the server-side version of the [jQuery](https://jquery.com) library, Cheerio features a very similar API with nearly identical selector implementation. This means DOM traversing, manipulation, querying, and data extraction are just as easy as with jQuery.

    This is equivalent to:

    ```javascript
    import * as cheerio from 'cheerio';
    ```

- ##### **`contentType: Object`**

    The `Content-Type` HTTP header parsed into an object with 2 properties, `type` and `encoding`.

    Example:

    ```javascript
    // Content-Type: application/json; charset=utf-8
    const mimeType = contentType.type; // "application/json"
    const encoding = contentType.encoding; // "utf-8"
    ```

- ##### **`customData: Object`**

    Contains the object provided in the **Custom data** (`customData`) input field.
    This is useful for passing dynamic parameters to your Cheerio Scraper using API.

- ##### **`enqueueRequest(request, [options]): AsyncFunction`**

    Adds a new URL to the request queue, if it wasn't already there.

    The `request` parameter is an object containing details of the request, with properties such as `url`, `userData`, `headers` etc. For the full list of the supported properties, see the [`Request`](https://crawlee.dev/api/core/class/Request) object's constructor in Crawlee's documentation.

    The optional `options` parameter is an object with additional options. Currently, it only supports the `forefront` boolean flag. If `true`, the request is added to the beginning of the queue. By default, requests are added to the end.

    Example:

    ```javascript
    await context.enqueueRequest({ url: 'https://www.example.com' });
    await context.enqueueRequest(
        { url: 'https://www.example.com/first' },
        { forefront: true },
    );
    ```

- ##### **`env: Object`**

    A map of all relevant values set by the Apify platform to the Actor run via the `APIFY_` environment variable. For example, here you can find information such as Actor run ID, timeouts, Actor run memory, etc.
    For the full list of available values, see the [`Actor.getEnv()`](https://sdk.apify.com/api/apify/class/Actor#getEnv) function in the Apify SDK documentation.

    Example:

    ```javascript
    console.log(`Actor run ID: ${context.env.actorRunId}`);
    ```

- ##### **`getValue(key): AsyncFunction`**

    Gets a value from the default key-value store associated with the Actor run. The key-value store is useful for persisting named data records, such as state objects, files, etc. The function is very similar to the [`Actor.getValue()`](https://sdk.apify.com/api/apify/class/Actor#getValue) function in Apify SDK.

    To set the value, use the dual function `context.setValue(key, value)`.

    Example:

    ```javascript
    const value = await context.getValue('my-key');
    console.dir(value);
    ```

- ##### **`globalStore: Object`**

    Represents an in-memory store that can be used to share data across page function invocations, e.g. state variables, API responses, or other data. The `globalStore` object has an interface similar to JavaScript's [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) object, with a few important differences:
    - All `globalStore` functions are `async`; use `await` when calling them.
    - Keys must be strings and values must be JSON stringify-able.
    - The `forEach()` function is not supported.

    Note that stored data is not persisted. If the Actor run is restarted or migrated to another worker server,
    the content of `globalStore` is reset. Therefore, never depend on a specific value to be present
    in the store.

    Example:

    ```javascript
    let movies = await context.globalStore.get('cached-movies');
    if (!movies) {
        movies = await fetch('http://example.com/movies.json');
        await context.globalStore.set('cached-movies', movies);
    }
    console.dir(movies);
    ```

- ##### **`input: Object`**

    An object containing the Actor run input, i.e. Cheerio Scraper's configuration. Each page function invocation gets a fresh copy of the `input` object, so changing its properties has no effect.

- ##### **`json: Object`**

    The parsed object from a JSON string if the response contains the content type `application/json`.

- ##### **`log: Object`**

    An object containing logging functions, with the same interface as provided by the
    [`crawlee.utils.log`](https://crawlee.dev/api/core/class/Log) object in Crawlee. The log messages are written directly to the Actor run log, which is useful for monitoring and debugging.
    Note that `log.debug()` only logs messages if the **Debug log** input setting is set.

    Example:

    ```javascript
    const log = context.log;
    log.debug('Debug message', { hello: 'world!' });
    log.info('Information message', { all: 'good' });
    log.warning('Warning message');
    log.error('Error message', { details: 'This is bad!' });
    try {
        throw new Error('Not good!');
    } catch (e) {
        log.exception(e, 'Exception occurred', {
            details: 'This is really bad!',
        });
    }
    ```

- ##### **`saveSnapshot(): AsyncFunction`**

    Saves the full HTML of the current page to the key-value store
    associated with the Actor run, under the `SNAPSHOT-BODY` key.
    This feature is useful when debugging your scraper.

    Note that each snapshot overwrites the previous one and the `saveSnapshot()` calls are throttled to at most one call in two seconds, in order to avoid excess consumption of resources and slowdown of the Actor.

- ##### **`setValue(key, data, options): AsyncFunction`**

    Sets a value to the default key-value store associated with the Actor run. The key-value store is useful for persisting named data records, such as state objects, files, etc. The function is very similar to the [`Actor.setValue()`](https://sdk.apify.com/api/apify/class/Actor#setValue) function in Apify SDK.

    To get the value, use the dual function `context.getValue(key)`.

    Example:

    ```javascript
    await context.setValue('my-key', { hello: 'world' });
    ```

- ##### **`skipLinks(): AsyncFunction`**

    Calling this function ensures that page links from the current page will not be added to the request queue, even if they match the [**Link selector**](#link-selector) and/or **[Glob Patterns](#glob-patterns)**/**[Pseudo-URLs](#pseudo-urls)** settings. This is useful to programmatically stop recursive crawling, e.g. if you know there are no more interesting links on the current page to follow.

- ##### **`request: Object`**

    An object containing information about the currently loaded web page, such as the URL, number of retries, a unique key, etc. Its properties are equivalent to the [`Request`](https://crawlee.dev/api/core/class/Request) object in Crawlee.

- ##### **`response: Object`**

    An object containing information about the HTTP response from the web server. Currently, it only contains the `status` and `headers` properties. For example:

    ```javascript
    {
      // HTTP status code
      status: 200,

      // HTTP headers
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'date': 'Wed, 06 Nov 2019 16:01:53 GMT',
        'cache-control': 'no-cache',
        'content-encoding': 'gzip',
      }
    }
    ```

<!-- TODO: We're missing more detailed description for prepareRequestFunction, what is it good for?
Give some example, also better prefill -->

## Proxy configuration

The **Proxy configuration** (`proxyConfiguration`) option enables you to set
proxies that will be used by the scraper in order to prevent its detection by target web pages.
You can use both the [Apify Proxy](https://apify.com/proxy) and custom HTTP or SOCKS5 proxy servers.

Proxy is required to run the scraper. The following table lists the available options of the proxy configuration setting:

<table class="table table-bordered table-condensed">
    <tbody>
    <tr>
        <th><b>Apify&nbsp;Proxy&nbsp;(automatic)</b></td>
        <td>
            The scraper will load all web pages using the <a href="https://apify.com/proxy">Apify Proxy</a>
            in automatic mode. In this mode, the proxy uses all proxy groups that are available to the user. For each new web page it automatically selects the proxy that hasn't been used in the longest time for the specific hostname in order to reduce the chance of detection by the web page.
            You can view the list of available proxy groups on the <a href="https://console.apify.com/proxy" target="_blank" rel="noopener">Proxy</a> page in Apify Console.
        </td>
    </tr>
    <tr>
        <th><b>Apify&nbsp;Proxy&nbsp;(selected&nbsp;groups)</b></td>
        <td>
            The scraper will load all web pages using the <a href="https://apify.com/proxy">Apify Proxy</a>
            with specific groups of target proxy servers.
        </td>
    </tr>
    <tr>
        <th><b>Custom&nbsp;proxies</b></td>
        <td>
            <p>
            The scraper will use a custom list of proxy servers.
            The proxies must be specified in the <code>scheme://user:password@host:port</code> format.
            Multiple proxies should be separated by a space or new line. The URL scheme can be either <code>http</code> or <code>socks5</code>. User and password might be omitted, but the port must always be present.
            </p>
            <p>
                Example:
            </p>
            <pre><code class="language-none">http://bob:password@proxy1.example.com:8000<br>http://bob:password@proxy2.example.com:8000</code></pre>
        </td>
    </tr>
    </tbody>
</table>

The proxy configuration can be set programmatically when calling the Actor using the API
by setting the `proxyConfiguration` field.
It accepts a JSON object with the following structure:

```javascript
{
    // Indicates whether to use the Apify Proxy or not.
    "useApifyProxy": Boolean,

    // Array of Apify Proxy groups, only used if "useApifyProxy" is true.
    // If missing or null, the Apify Proxy will use automatic mode.
    "apifyProxyGroups": String[],

    // Array of custom proxy URLs, in "scheme://user:password@host:port" format.
    // If missing or null, custom proxies are not used.
    "proxyUrls": String[],
}
```

## Advanced Configuration

### Pre-navigation hooks

<!-- todo request as browser is out -->

This is an array of functions that will be executed **BEFORE** the main `pageFunction` is run. A similar `context` object is passed into each of these functions as is passed into the `pageFunction`; however, a second `gotOptions` object is also passed in.

The available options can be seen here:

```JavaScript
preNavigationHooks: [
    async ({ id, request, session, proxyInfo, customData, Actor }, { url, method, headers, proxyUrl }) => {}
]
```

Check out the docs for [Pre-navigation hooks](https://crawlee.dev/api/cheerio-crawler/interface/CheerioCrawlerOptions#preNavigationHooks) and the [CheerioHook type](https://crawlee.dev/api/cheerio-crawler#CheerioHook) for more info regarding the objects passed into these functions. The available properties are extended with `Actor` (alternatively `Apify`) and `customData` in this scraper.

### Post-navigation hooks

An array of functions that will be executed **AFTER** the main `pageFunction` is run. The only available parameter is the [CrawlingContext](https://crawlee.dev/api/cheerio-crawler/interface/CheerioCrawlingContext) object. The available properties are extended with `Actor` (alternatively `Apify`) and `customData` in this scraper.

```JavaScript
postNavigationHooks: [
    async ({ id, request, session, proxyInfo, response, customData, Actor }) => {}
]
```

Check out the docs for [Pre-navigation hooks](https://crawlee.dev/api/cheerio-crawler/interface/CheerioCrawlerOptions#preNavigationHooks) for more info regarding the objects passed into these functions.

## Results

The scraping results returned by [**Page function**](#page-function) are stored in the default dataset associated with the Actor run, from where you can export them to formats such as JSON, XML, CSV or Excel.
For each object returned by the [**Page function**](#page-function), Cheerio Scraper pushes one record into the dataset and extends it with metadata such as the URL of the web page where the results come from.

For example, if your page function returned the following object:

```js
{
    message: 'Hello world!';
}
```

The full object stored in the dataset will look as follows
(in JSON format, including the metadata fields `#error` and `#debug`):

```json
{
    "message": "Hello world!",
    "#error": false,
    "#debug": {
        "requestId": "fvwscO2UJLdr10B",
        "url": "https://www.example.com/",
        "loadedUrl": "https://www.example.com/",
        "method": "GET",
        "retryCount": 0,
        "errorMessages": null,
        "statusCode": 200
    }
}
```

To download the results, call the
[Get dataset items](https://docs.apify.com/api/v2#/reference/datasets/item-collection)
API endpoint:

```
https://api.apify.com/v2/datasets/[DATASET_ID]/items?format=json
```

where `[DATASET_ID]` is the ID of the Actor's run dataset, in which you can find the Run object returned when starting the Actor. Alternatively, you'll find the download links for the results in Apify Console.

To skip the `#error` and `#debug` metadata fields from the results and not include empty result records,
simply add the `clean=true` query parameter to the API URL, or select the **Clean items** option when downloading the dataset in Apify Console.

To get the results in other formats, set the `format` query parameter to `xml`, `xlsx`, `csv`, `html`, etc.
For more information, see [Datasets](https://docs.apify.com/storage#dataset) in documentation
or the [Get dataset items](https://docs.apify.com/api/v2#/reference/datasets/item-collection)
endpoint in Apify API reference.

## Integrations

Cheerio Scraper can be connected with almost any cloud service or web app thanks to [integrations on the Apify platform](https://apify.com/integrations). You can integrate with Make, Zapier, ChatGPT, Slack, Airbyte, GitHub, Google Sheets, Asana, Google Drive, Keboola, MCP Servers, and more.

You can also use [webhooks](https://docs.apify.com/integrations/webhooks) to carry out an action whenever an event occurs, e.g., get a notification whenever a Cheerio Scraper run successfully finishes.

## FAQ

### How do I build a page function?

The fastest way is the step-by-step [**Scraping with Cheerio Scraper**](https://docs.apify.com/academy/apify-scrapers/cheerio-scraper) tutorial in the Apify Academy. It walks you through selecting elements with Cheerio, returning data, and following links.

If you'd rather skip the page function entirely, try the [**AI Web Scraper**](https://apify.com/apify/ai-web-scraper) — you describe what to extract in plain English and the Actor handles the rest.

### When should I use Puppeteer or Playwright instead of Cheerio?

Use **Cheerio Scraper** for static HTML — it's faster and cheaper because no browser is involved. Cheerio only sees the raw HTML response, so it can't reach content rendered by client-side JavaScript (single-page apps, infinite scroll, lazy-loaded content). Puppeteer- and Playwright-based scrapers run a real browser, so they handle dynamic content, click and scroll interactions, and login flows that Cheerio can't.

The two libraries are similar; the main difference is browser support. **Puppeteer** is Chrome-only. **Playwright** also supports Firefox and WebKit. On Apify, you can choose:

- [**Web Scraper**](https://apify.com/apify/web-scraper) — the simplest browser-based scraper, runs in the browser context, uses Puppeteer under the hood.
- [**Puppeteer Scraper**](https://apify.com/apify/puppeteer-scraper) — lower-level control over the Puppeteer library.
- [**Playwright Scraper**](https://apify.com/apify/playwright-scraper) — same idea, with Playwright.

### Can I build my own Actor with Cheerio?

Yes. The Cheerio Scraper Actor is open source — [view the source on Apify](https://apify.com/apify/cheerio-scraper/source-code) or [fork it on GitHub](https://github.com/apify/actor-scraper/tree/master/packages/actor-scraper/cheerio-scraper) to adjust it to your needs. Or build a custom Actor from scratch — start from one of the [Cheerio-based Apify Actor templates](https://apify.com/templates?search=cheerio) and use Crawlee's [`CheerioCrawler`](https://crawlee.dev/js/api/cheerio-crawler) for full control over the crawl, with [Cheerio](https://cheerio.js.org)'s parsing API and Apify's platform features.

### Can I export Cheerio Scraper data using the Apify API?

Yes. The Apify API gives you programmatic access to your runs and datasets. To access the API using Node.js, use the `apify-client` [npm package](https://apify.com/apify/cheerio-scraper/api/javascript). To access the API using Python, use the `apify-client` [PyPI package](https://apify.com/apify/cheerio-scraper/api/python). Check out the [Apify API reference](https://docs.apify.com/api/v2) docs or click on the [API tab](https://apify.com/apify/cheerio-scraper/api) for code examples.

### Can I use Cheerio Scraper through an MCP server?

Yes. With Apify's [MCP server](https://apify.com/apify/cheerio-scraper/api/mcp) you can run Cheerio Scraper inside AI agent workflows from clients like Claude Desktop and LibreChat, or build your own. See the [MCP tab](https://apify.com/apify/cheerio-scraper/api/mcp) for setup details.

### Do I need proxies to use Cheerio Scraper?

You usually do, especially for sites with anti-scraping protections. Cheerio Scraper integrates with [Apify Proxy](https://apify.com/proxy): datacenter proxies are included in the Free plan; residential proxies are available on paid plans. Configure them under [**Proxy configuration**](#proxy-configuration).

### Is it legal to scrape with Cheerio Scraper?

Cheerio Scraper extracts whatever the target site serves over public HTTP — your responsibility is to scrape ethically and respect the site's terms of service, `robots.txt`, and applicable law. You should not scrape personal data unless you have a legitimate reason to do so. Read more on the [legality of web scraping](https://blog.apify.com/is-web-scraping-legal/) and [ethical scraping](https://blog.apify.com/what-is-ethical-web-scraping-and-how-do-you-do-it/).

### Cheerio Scraper is not working?

We're always working on improving the performance of our Actors. If you've got technical feedback or found a bug, please create an issue on the Actor's [Issues tab](https://apify.com/apify/cheerio-scraper/issues/open).

## Additional resources

Congratulations! You've learned how Cheerio Scraper works.
You might also want to see these other resources:

- [Web scraping tutorial](https://docs.apify.com/tutorials/apify-scrapers) -
  An introduction to web scraping with Apify.
- [Scraping with Cheerio Scraper](https://docs.apify.com/tutorials/apify-scrapers/cheerio-scraper) -
  A step-by-step tutorial on how to use Cheerio Scraper, with a detailed explanation and examples.
- **Web Scraper** ([apify/web-scraper](https://apify.com/apify/web-scraper)) -
  Apify's basic tool for web crawling and scraping. It uses a full Chrome browser to render dynamic content.
  A similar web scraping Actor to Puppeteer Scraper, but is simpler to use and only runs in the context of the browser.
  Uses the [Puppeteer](https://github.com/GoogleChrome/puppeteer) library.
- [Actors documentation](https://docs.apify.com/actors) -
  Documentation for the Apify Actors cloud computing platform.
- [Apify SDK documentation](https://sdk.apify.com) - Learn more about the tools required to run your own Apify Actors.
- [Crawlee documentation](https://crawlee.dev) - Learn how to build a new web scraping project from scratch using the world's most popular web crawling and scraping library for Node.js.
