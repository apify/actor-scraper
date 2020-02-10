# Cheerio Scraper

Cheerio Scraper is a ready-made solution for crawling the web using plain HTTP requests. It allows the user to retrieve HTML pages, then parse and inspect the HTML using the [Cheerio](https://www.npmjs.com/package/cheerio) library. Fast.

Cheerio is a server-side version of the popular [jQuery](https://jquery.com) library. It does not require a
browser but instead constructs a DOM from a HTML string. It then provides the user an API to work with that DOM.

Cheerio Scraper is ideal for scraping websites that do not rely on client-side JavaScript to serve their content and can be up to 20 times faster than using a full-browser solution such as Puppeteer.

If you're unfamiliar with web scraping or front-end web development in general,
you might prefer to start with the  [**Web scraping tutorial**](https://apify.com/docs/scraping/web-scraper-tutorial) from the Apify documentation and then continue with [**Scraping with Cheerio Scraper**](https://docs.apify.com/scraping/cheerio-scraper), a tutorial which will walk you through all the steps and provide a number of examples.

## Table of Contents

<!-- toc -->

- [Usage](#usage)
- [Lmitations](#limitations)
- [Input configuration](#input-configuration)
  * [Start URLs](#start-urls)
  * [Use request queue](#use-request-queue)
  * [Link selector](#link-selector)
  * [Pseudo-URLs](#pseudo-urls)
  * [Page function](#page-function)
- [`context`](#context)
  * [Data structures](#data-structures)
  * [Functions](#functions)
  * [Class instances and namespaces](#class-instances-and-namespaces)
    + [Request](#request)
    + [Response](#response)
    + [AutoscaledPool](#autoscaledpool)
    + [Global Store](#global-store)
    + [Log](#log)
    + [Apify](#apify)
- [Output](#output)
  * [Dataset](#dataset)

<!-- tocstop -->

## Usage

To get started with Cheerio Scraper, you only need two things. First, tell the scraper which web pages
it should load. Second, tell it how to extract data from each page.

The scraper starts by loading the pages specified in the [**Start URLs**](#start-urls) field.
Optionally, you can make the scraper follow page links on the fly by enabling the [**Use request queue**](#use-request-queue) option. Then, just set a [**Link selector**](#link-selector) and/or [**Pseudo URLs**](#pseudo-urls) to tell the scraper which links it should add to the crawling queue. This is useful for the recursive crawling of entire websites, e.g. to find all products in an online store.

To tell the scraper how to extract data from web pages, you need to provide a [**Page function**](#page-function). This is JavaScript code that is executed in the context of every web page loaded. Since the scraper does not use the full browser, writing the **Page function** is equivalent to writing server-side code - it uses the server-side library [Cheerio](https://www.npmjs.com/package/cheerio).

In summary, Cheerio Scraper works as follows:

1. Adds each [Start URL](#start-urls) to the crawling queue.
2. Fetches the first URL from the queue and constructs a DOM from the fetched HTML string.
3. Executes the [**Page function**](#page-function) on the loaded page and saves its results.
4. Optionally, finds all links from the page using the [**Link selector**](#link-selector).
   If a link matches any of the [**Pseudo URLs**](#pseudo-urls) and has not yet been visited, adds it to the queue.
5. If there are more items in the queue, repeats step 2, otherwise finishes.

Cheerio Scraper has a number of advanced configuration settings to improve performance, set cookies for login to websites, limit the number of records, etc. 
See [Advanced configuration](#advanced-configuration) below for the complete list of settings.

## Limitations

The actor does not employ a full-featured Chromium web browser, so will not be sufficient for websites that render their content dynamically using client-side Javascript. To scrape such sites, you might prefer to use [**Web Scraper**](https://apify.com/apify/web-scraper) (`apify/web-scraper`), which loads pages in a full browser and renders dynamic content.

Since Cheerio Scraper's **page function** is executed in the context of the server, it only supports server-side JavaScript code. If you need to combine client- and server-side libraries using the underlying [Puppeteer](https://github.com/GoogleChrome/puppeteer/) library, you might prefer to use
[**Puppeteer Scraper**](https://apify.com/apify/puppeteer-scraper) (`apify/puppeteer-scraper`). For even more flexibility and control, you might develop a new actor from scratch in Node.js using [Apify SDK](https://sdk.apify.com).

## Input configuration

As input, Cheerio Scraper actor accepts a number of configurations. These can be entered either manually in the user interface in the [Apify app](https://my.apify.com), or programmatically in a JSON object using the [Apify API](https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor). For a complete list of input fields and their types, please visit the [Input](https://apify.com/apify/cheerio-scraper?section=input-schema) tab.

### Start URLs

The **Start URLs** (`startUrls`) field represents the initial list of pages that the scraper will visit.
You can either enter the URLs manually one by one, upload them in a CSV file, or [link URLs from a Google Sheet](https://help.apify.com/en/articles/2906022-scraping-a-list-of-urls-from-google-spreadsheet) document.
Each URL must start with either a `http://` or `https://` protocol prefix.

Optionally, each URL can be associated with custom user data - a JSON object that can be referenced from
your JavaScript code in the [**Page function**](#page-function) under `context.request.userData`.
This is useful for determining which start URL is currently loaded, in order to perform some page-specific actions. For example, when crawling an online store, you might want to perform different actions on a page listing the products vs. a product detail page. For details, see the [**Web scraping tutorial**](https://apify.com/docs/scraping/tutorial/introduction#the-start-url)
in the Apify documentation.

### Use request queue

The **Use request queue** (`useRequestQueue`) option determines whether the scraper will use a dynamic queue to manage URLs in addition to the static list of [**Start URLs**](#start-urls). If the option is enabled, the scraper will support adding new URLs to scrape on the fly, either using the [**Link selector**](#link-selector) and [**Pseudo-URLs**](#pseudo-urls) options or by calling `context.enqueueRequest()` inside the [**Page function**](#page-function). Use of the request queue has some overheads, so only enable this option if you need to add URLs dynamically.

<!-- TODO: Describe how the queue works, unique key etc. plus link -->

### Link selector

The **Link selector** (`linkSelector`) field contains a CSS selector that is used to find links to other web pages, i.e. `<a>` elements with the `href` attribute. This setting only applies if the [**Use request queue**](#use-request-queue) option is enabled, otherwise it is ignored and no links are followed.

On every page loaded, the scraper looks for all links matching the **Link selector**. It checks that the target URL matches one of the [**Pseudo-URLs**](#pseudo-urls), and if so then adds the URL to the request queue, to be loaded by the scraper later.

By default, new scrapers are created with the following selector that matches all links:

```
a[href]
```

If the **Link selector** is empty, page links are ignored, and the scraper only loads pages that were specified in the [**Start URLs**](#start-urls) input or that were manually added to the request queue by calling `context.enqueueRequest()` in the [**Page function**](#page-function).

### Pseudo-URLs

The **Pseudo-URLs** (`pseudoUrls`) field specifies what kind of URLs found by [**Link selector**](#link-selector) should be added to the request queue. This setting only applies if the [**Use request queue**](#use-request-queue) option is enabled.

A pseudo-URL is simply a URL with special directives enclosed in `[]` brackets. Currently, the only supported directive is `[regexp]`, which defines a JavaScript-style regular expression to match against the URL.

For example, the pseudo-URL `http://www.example.com/pages/[(\w|-)*]` will match all of the following URLs:

- `http://www.example.com/pages/`
- `http://www.example.com/pages/my-awesome-page`
- `http://www.example.com/pages/something`

If either `[` or `]` is part of the normal query string, it must be encoded as `[\x5B]` or `[\x5D]`, respectively. For example, the following pseudo-URL:

```
http://www.example.com/search?do[\x5B]load[\x5D]=1
```

will match the URL:

```
http://www.example.com/search?do[load]=1
```

Optionally, each pseudo-URL can be associated with user data that can be referenced from your [**Page function**](#page-function) using `context.request.userData` to determine what kind of page is currently loaded in the browser.

Note that you don't have to use the **Pseudo-URLs** setting at all because you can completely control which pages the scraper will access by calling `context.enqueuePage()` from your [**Page function**](#page-function).

### Page function

The **Page function** (`pageFunction`) field contains a single JavaScript function that enables the user to extract data from the web page, manipulate the DOM by clicking elements, add new URLs to the request queue, and otherwise control Web Scraper's operation.

Example:

```javascript
async function pageFunction(context) {
    //Pass a destructuring assignment of the necessary properties of the **context** object
    const { $, request, log } = context;
    const title = $('title').text();

    //Print URL and title information to the context log
    log.info(`URL: ${request.url} TITLE: ${title}`);

    // Return an object with the data extracted from the page.
    // It will be stored to the resulting dataset.
    return {
        url: request.url,
        title
    };
}
```

The code runs in [Node.js 10](#https://nodejs.org/en/blog/release/v10.0.0/) and the function accepts a single argument, the `context` object, whose properties are listed below.

The return value of the page function is an object (or an array of objects) representing the data extracted from the web page. The return value must be stringify-able to JSON, i.e. it can only contain basic types and no circular references. If you prefer not to extract any data from the page and skip it in the clean results, simply return `null` or `undefined`.

The **Page function** supports the JavaScript ES6 syntax and is asynchronous, which means you can use the `await` keyword to wait for background operations to finish. To learn more about `async` functions,
visit the [Mozilla documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function).

**Properties of the `context` object:**

- ##### **`customData: Object`**

  Contains the object provided in the **Custom data** (`customData`) input field.
  This is useful for passing dynamic parameters to your Web Scraper using API.

- ##### **`enqueueRequest(request, [options]): AsyncFunction`**
  
  Adds a new URL to the request queue, if it wasn't already there. To call this function, the [**Use request queue**](#use-request-queue) option must be enabled, otherwise an error will be thrown.

  The `request` parameter is an object containing details of the request, with properties such as `url`, `userData`, `headers` etc. For the full list of the supported properties, visit the [`Request`](https://sdk.apify.com/docs/api/request) object's constructor in the Apify SDK documentation.
  
  The optional `options` parameter is an object with additional options. Currently, it only supports the `forefront` boolean flag. If `true`, the request is added to the beginning of the queue. By default, requests are added to the end.
  
  Example:
  ```javascript
  await context.enqueueRequest({ url: 'https://www.example.com' });
  await context.enqueueRequest({ url: 'https://www.example.com/first' }, { forefront: true });
  ```
  





```js
const context = {
    // USEFUL DATA
    input, // Unaltered original input as parsed from the UI
    env, // Contains information about the run such as actorId or runId
    customData, // Value of the 'Custom data' scraper option.
    body, // Request body of loaded page
    json, // Available only if Content-Type header of the response is application/json
    
    // EXPOSED OBJECTS
    request, // Apify.Request object.
    response, // Response object holding the status code and headers.
    autoscaledPool, // Reference to the Apify.AutoscaledPool instance managing concurrency.
    globalStore, // Represents an in memory store that can be used to share data across pageFunction invocations.
    log, // Reference to Apify.utils.log
    Apify, // Reference to the full power of Apify SDK.
    contentType, // Parsed Content-Type header
    cheerio, // The cheerio module itself.
    
    // EXPOSED FUNCTIONS
    $, // Reference to Cheerio.
    setValue, // Reference to the Apify.setValue() function.
    getValue, // Reference to the Apify.getValue() function.
    saveSnapshot, // Saves the full HTML of the current page to the key value store.
    skipLinks, // Prevents enqueueing more links via Pseudo URLs on the current page.
    enqueueRequest, // Adds a page to the request queue.
    
}
```
## `context`
The following tables describe the `context` object in more detail.

### Data structures
<table>
<thead>
    <tr><td>Argument</td><td>Type</td></tr>
</thead>
<tbody>
    <tr><td><code>input</code></td><td><code>Object</code></td></tr>
    <tr><td colspan="2">
        Input as it was received from the UI. Each <code>pageFunction</code> invocation gets a fresh
        copy and you can not modify the input by changing the values in this object.
    </td></tr>
    <tr><td><code>env</code></td><td><code>Object</code></td></tr>
    <tr><td colspan="2">
        A map of all the relevant environment variables that you may want to use. See the
        <a href="https://sdk.apify.com/docs/api/apify#apifygetenv-code-object-code" target="_blank"><code>Apify.getEnv()</code></a>
        function for a preview of the structure and full documentation.
    </td></tr>
    <tr><td><code>customData</code></td><td><code>Object</code></td></tr>
    <tr><td colspan="2">
        Since the input UI is fixed, it does not support adding of other fields that may be needed for all
        specific use cases. If you need to pass arbitrary data to the scraper, use the Custom data input field
        and its contents will be available under the <code>customData</code> context key.
    </td></tr>
    <tr><td><code>body</code></td><td><code>string|Buffer</code></td></tr>
    <tr><td colspan="2">
        This is the body from the target website. If the website is in HTML or XML format, it will be a string that contains HTML or XML content.
        It will be buffer in other cases. If you need to process body as a string, you can use contentType object to set up right encoding to the string.<br>
        <code>const stringBody = context.body.toString(context.contentType.encoding)</code>
    </td></tr>
    <tr><td><code>json</code></td><td><code>Object</code></td></tr>
    <tr><td colspan="2">
        The parsed object from JSON string if the response contains the content type <code>application/json</code>
    </td></tr>
    <tr><td><code>contentType</code></td><td><code>{ type: string, encoding: string }</code></td></tr>
    <tr><td colspan="2">
        The <code>Content-Type</code> header parsed into an object with 2 properties, `type` and `encoding`.<br>
        <pre><code>
// Content-Type: application/json; charset=utf-8
const mimeType = contentType.type // application/json
const encoding = contentType.encoding // utf-8
</code></pre><br>
    </td></tr>
</tbody>
</table>

### Functions
The `context` object provides several helper functions that make scraping and saving data easier
and more streamlined. All of the functions are `async` so make sure to use `await` with their invocations.

<table>
<thead>
    <tr><td>Argument</td><td>Arguments</td></tr>
</thead>
<tbody>
    <tr><td><code>$</code></td>
    <td>
        <a href="https://github.com/cheeriojs/cheerio#-selector-context-root-" target="_blank">
            <code>selector, [context], [root]</code>
        </a>
    </td></tr>
    <tr><td colspan="2">
        Reference to the <a href="https://github.com/cheeriojs/cheerio" target="_blank">Cheerio</a>
        function, which enables you to work with the page's HTML just as `jQuery` would.
    </td></tr>
    <tr><td><code>setValue</code></td><td><code>(key: string, data: Object, options: Object)</code></td></tr>
    <tr><td colspan="2">
        To save data to the default key-value store, you can use the <code>setValue</code> function.
        See the full documentation:
        <a href="https://sdk.apify.com/docs/api/apify#apifysetvaluekey-value-options-code-promise-code" target="_blank">
            <code>Apify.setValue()</code>
        </a> function.
    </td></tr>
    <tr><td><code>getValue</code></td><td><code>(key: string)</code></td></tr>
    <tr><td colspan="2">
        To read data from the default key-value store, you can use the <code>getValue</code> function.
        See the full documentation:
        <a href="https://sdk.apify.com/docs/api/apify#apifygetvaluekey-value-options-code-promise-code" target="_blank">
            <code>Apify.getValue()</code>
        </a> function.
    </td></tr>
    <tr><td><code>saveSnapshot</code></td><td></td></tr>
    <tr><td colspan="2">
        A helper function that enables saving a snapshot of the current page's HTML, as parsed by Cheerio,
        into the default key value store. Each snapshot overwrites the previous one and the function's
        invocations will also be throttled if invoked more than once in 2 seconds, to prevent abuse.
        So make sure you don't call it for every single request. You can find the HTML under the SNAPSHOT-BODY key.
    </td></tr>
    <tr><td><code>skipLinks</code></td><td></td></tr>
    <tr><td colspan="2">
        With each invocation of the <code>pageFunction</code> the scraper attempts to extract
        new URLs from the page using the Link selector and PseudoURLs provided in the input UI.
        If you want to prevent this behavior in certain cases, call the <code>skipLinks</code>
        function and no URLs will be added to the queue for the given page.
    </td></tr>
    <tr><td><code>enqueueRequest</code></td><td><code>(request: Request|Object, options: Object)</code></td></tr>
    <tr><td colspan="2">
        To enqueue a specific URL manually instead of automatically by a combination of a Link selector
        and a Pseudo URL, use the <code>enqueueRequest</code> function. It accepts a plain object as argument
        that needs to have the structure to construct a
        <a href="https://sdk.apify.com/docs/api/request" target="_blank"><code>Request</code></a> object.
        But frankly, you just need a URL: <code>{ url: 'https://www.example.com }</code>
    </td></tr>
</tbody>
</table>

### Class instances and namespaces
The following are either class instances or namespaces, which is just a way of saying objects
with functions on them.

#### Request
Apify uses a `request` object to represent metadata about the currently crawled page,
such as its URL or the number of retries. See the
<a href="https://sdk.apify.com/docs/api/request" target="_blank"><code>Request</code></a>
class for a preview of the structure and full documentation.

#### Response
The `response` object is produced by the HTTP call. Currently, we only pass the HTTP status code
and the response headers to the `context`.

```js
{
    status: Number,
    headers: Object,
}
```

#### AutoscaledPool
A reference to the running instance of the `AutoscaledPool` class. See
<a href="https://sdk.apify.com/docs/api/autoscaledpool" target="_blank">Apify SDK docs</a>
for more information.

#### Global Store
`globalStore` represents an instance of a very simple in memory store that is not scoped to the individual
`pageFunction` invocation. This enables you to easily share global data such as API responses, tokens and other.
Since the stored data need to cross from the Browser to the Node.js process, it cannot be any kind of data,
but only JSON stringifiable objects. You cannot store DOM objects, functions, circular objects and so on.

`globalStore` in Cheerio Scraper is just a 
<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map" target="_blank">
<code>Map</code></a>.

#### Log
`log` is a reference to
<a href="https://sdk.apify.com/docs/api/log" target="_blank"><code>Apify.utils.log</code></a>.
You can use any of the logging methods such as <code>log.info</code> or <code>log.exception</code>.
<code>log.debug</code> is special, because you can trigger visibility of those messages in the
scraper's Log by the provided **Debug log** input option.

#### Apify
A reference to the full power of the Apify SDK. See
<a href="https://sdk.apify.com/docs/api/apify" target="_blank">the docs</a>
for more information and all the available functions and classes.

**Caution:** Since we're making the full SDK available, and Cheerio Scraper
runs using the SDK, some edge case manipulations may lead to inconsistencies.
Use `Apify` with caution and avoid making global changes unless you know what you're doing.

#### Cheerio
`cheerio` references the Cheerio module. What you'd get by running `require('cheerio')`.
It is useful for calling cheerio.load() on pieces of HTML that you receive from non-HTML
responses, such as JSON containing HTML properties.

## Output
Output is a dataset containing extracted data for each scraped page. To save data into
the dataset, return an `Object` or an `Object[]` from the `pageFunction`.

### Dataset
For each of the scraped URLs, the dataset contains an object with results and some metadata.
If you were scraping the HTML `<title>` of [Apify](https://apify.com/) and returning
the following object from the `pageFunction`

```js
return {
  title: "Web Scraping, Data Extraction and Automation - Apify"
}
```

it would look like this:

```json
{
  "title": "Web Scraping, Data Extraction and Automation - Apify",
  "#error": false,
  "#debug": {
    "requestId": "fvwscO2UJLdr10B",
    "url": "https://apify.com",
    "loadedUrl": "https://apify.com/",
    "method": "GET",
    "retryCount": 0,
    "errorMessages": null,
    "statusCode": 200
  }
}
```

You can remove the metadata (and results containing only metadata) from the results
by selecting the **Clean items** option when downloading the dataset.

The result will look like this:

```json
{
  "title": "Web Scraping, Data Extraction and Automation - Apify"
}
```
