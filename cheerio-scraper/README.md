# Cheerio Scraper

Cheerio Scraper is a ready-made solution for crawling the web using plain HTTP requests. It allows the user to retrieve HTML pages, then parse and inspect the HTML using the [Cheerio](https://cheerio.js.org) library. Fast.

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
    + [**`Data structures`**](#data-structures)
      - [**`input: Object`**](#input-object)
      - [**`env: Object`**](#env-object)
      - [**`customData: Object`**](#customdata-object)
      - [**`body: String/Buffer`**](#body-string/buffer)
      - [**`json: Object`**](#json-object)
      - [**`contentType: {type, encoding}`**](#contenttype-type-encoding)
    + [**`Functions`**](#functions)
      - [**`$: Function`**](#$-function)
      - [**`setValue(key, data, options): AsyncFunction`**](#setvaluekey-data-options-asyncfunction)
      - [**`getValue(key): AsyncFunction`**](#getvaluekey-asyncfunction)
      - [**`saveSnapshot(): AsyncFunction`**](#savesnapshot-asyncfunction)
      - [**`skipLinks(): AsyncFunction`**](#skiplinks-asyncfunction)
      - [**`enqueueRequest(request, [options]): AsyncFunction`**](#enqueuerequestrequest-options-asyncfunction)
    + [**`Class instances and namescapes`**](#class-instances-and-namescapes)
      - [**`request: Object`**](#request-object)
      - [**`response: Object`**](#response-object)
      - [**`autoscaledPool: Object`**](#autoscaledpool-object)
      - [**`globalStore: Object`**](#globalstore-object)
      - [**`log: Object`**](#log-object)
      - [**`Apify: Object`**](#apify-object)
      - [**`cheerio: Object`**](#cheerio-object)
- [Proxy configuration](#proxy-configuration)


- [Output](#output)
  * [Dataset](#dataset)

<!-- tocstop -->

## Usage

To get started with Cheerio Scraper, you only need two things. First, tell the scraper which web pages
it should load. Second, tell it how to extract data from each page.

The scraper starts by loading the pages specified in the [**Start URLs**](#start-urls) field.
Optionally, you can make the scraper follow page links on the fly by enabling the [**Use request queue**](#use-request-queue) option. Then, just set a [**Link selector**](#link-selector) and/or [**Pseudo URLs**](#pseudo-urls) to tell the scraper which links it should add to the crawling queue. This is useful for the recursive crawling of entire websites, e.g. to find all products in an online store.

To tell the scraper how to extract data from web pages, you need to provide a [**Page function**](#page-function). This is JavaScript code that is executed in the context of every web page loaded. Since the scraper does not use the full browser, writing the **Page function** is equivalent to writing server-side code - it uses the server-side library [Cheerio](https://cheerio.js.org).

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

Since Cheerio Scraper's **Page function** is executed in the context of the server, it only supports server-side JavaScript code. If you need to combine client- and server-side libraries using the underlying [Puppeteer](https://github.com/GoogleChrome/puppeteer/) library, you might prefer to use
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

#### **`Data structures`**

- ##### **`input: Object`**

  An object containing the actor run input, i.e. the Web Scraper's configuration. Each page function invocation gets a fresh copy of the `input` object, so changing its properties has no effect.

- ##### **`env: Object`**

  A map of all relevant values set by the Apify platform to the actor run via the `APIFY_` environment variable. For example, here you can find information such as actor run ID, timeouts, actor run memory, etc.
  For the full list of available values, see the [`Apify.getEnv()`](https://sdk.apify.com/docs/api/apify#module_Apify.getEnv) function in the Apify SDK.
  
  Example:
  ```javascript
  console.log(`Actor run ID: ${context.env.actorRunId}`);
  ```

- ##### **`customData: Object`**

  Contains the object provided in the **Custom data** (`customData`) input field.
  This is useful for passing dynamic parameters to your Web Scraper using API.


- ##### **`body: String|Buffer`**

  The body from the target web page. If the website is in HTML or XML format, it will be a string that contains HTML or XML content. In other cases, the `body` with be a Buffer. If you need to process the `body` as a string, you can use the `contentType` object to set up encoding for the string.

  Example:
  ```javascript
  const stringBody = context.body.toString(context.contentType.encoding)
  ```

- ##### **`json: Object`**

  The parsed object from a JSON string if the response contains the content type `application/json`.

- ##### **`contentType: {type, encoding}`**

  The `Content-Type` header parsed into an object with 2 properties, `type` and `encoding`.

  Example:
  ```javascript
  // Content-Type: application/json; charset=utf-8
  const mimeType = contentType.type // application/json
  const encoding = contentType.encoding // utf-8
  ```

#### **`Functions`**

- ##### **`$: Function`**

  An instance of the Cheerio module, the `selector` searches within the `context` scope, which searches within the `root` scope. The `selector` and `context` can be a string expression, DOM Element, array of DOM elements, or a `cheerio` object. Meanwhile, the `root` is typically the HTML document string.

  This selector method is the starting point for traversing and manipulating the document. Like with `jQuery`, it is the primary method for selecting elements in the document, but unlike jQuery it is built on top of the [`css-select`](https://www.npmjs.com/package/css-select) library, which implements most of the [`Sizzle`](https://github.com/jquery/sizzle/wiki) selectors.

  For more information, see the [`Selectors`](https://github.com/cheeriojs/cheerio/#selectors) section in the Cheerio documentation.

  Example:
  ```html
  <ul id="movies">
    <li class="fun-movie">Fun Movie</li>
    <li class="sad-movie">Sad Movie</li>
    <li class="horror-movie">Horror Movie</li>
  </ul>
  ```

  ```javascript
  $('.movies', '#fun-movie').text()
  //=> Fun Movie
  $('ul .sad-movie').attr('class')
  //=> sad-movie
  $('li[class=horror-movie]').html()
  //=> Horror Movie
  ```

- ##### **`setValue(key, data, options): AsyncFunction`**

  Sets a value to the default key-value store associated with the actor run. The key-value store is useful for persisting named data records, such as state objects, files, etc. The function is very similar to the [`Apify.setValue()`](https://sdk.apify.com/docs/api/apify#apifysetvaluekey-value-options-promise) function in the Apify SDK.
    
  To get the value, use the dual function `context.getValue(key)`.
  
  Example:
  ```javascript
  await context.setValue('my-key', { hello: 'world' });
  ```

- ##### **`getValue(key): AsyncFunction`**

  Gets a value from the default key-value store associated with the actor run. The key-value store is useful for persisting named data records, such as state objects, files, etc. The function is very similar to the [`Apify.getValue()`](https://sdk.apify.com/docs/api/apify#apifygetvaluekey-promise-object) function in the Apify SDK.
  
  To set the value, use the dual function `context.setValue(key, value)`.
  
  Example:
  ```javascript
  const value = await context.getValue('my-key');
  console.dir(value);
  ```

- ##### **`saveSnapshot(): AsyncFunction`**
    
  Saves a screenshot and full HTML of the current page to the key-value store
  associated with the actor run, under the `SNAPSHOT-SCREENSHOT` and  `SNAPSHOT-HTML` keys, respectively.
  This feature is useful when debugging your scraper.
  
  Note that each snapshot overwrites the previous one and the `saveSnapshot()` calls are throttled to at most one call in two seconds, in order to avoid excess consumption of resources and slowdown of the actor.
  
- ##### **`skipLinks(): AsyncFunction`**

  Calling this function ensures that page links from the current page will not be added to the request queue, even if they match the [**Link selector**](#link-selector) and/or [**Pseudo-URLs**](#pseudo-urls) settings.  This is useful to programmatically stop recursive crawling, e.g. if you know there are no more interesting links on the current page to follow.

- ##### **`enqueueRequest(request, [options]): AsyncFunction`**
  
  Adds a new URL to the request queue, if it wasn't already there. To call this function, the [**Use request queue**](#use-request-queue) option must be enabled, otherwise an error will be thrown.

  The `request` parameter is an object containing details of the request, with properties such as `url`, `userData`, `headers` etc. For the full list of the supported properties, see the [`Request`](https://sdk.apify.com/docs/api/request) object's constructor in the Apify SDK.
  
  The optional `options` parameter is an object with additional options. Currently, it only supports the `forefront` boolean flag. If `true`, the request is added to the beginning of the queue. By default, requests are added to the end.
  
  Example:
  ```javascript
  await context.enqueueRequest({ url: 'https://www.example.com' });
  await context.enqueueRequest({ url: 'https://www.example.com/first' }, { forefront: true });
  ```

#### **`Class instances and namescapes`**

- ##### **`request: Object`**
  
  An object containing information about the currently loaded web page, such as the URL, number of retries, a unique key, etc. Its properties are equivalent to the [`Request`](https://sdk.apify.com/docs/api/request) object in the Apify SDK.
  
- ##### **`response: Object`**

  An object containing information about the HTTP response from the web server. Currently, it only contains the `status` and `headers` properties. For example:
  
  ```
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

- ##### **`AutoscaledPool: Object`**

  Manages a pool of asynchronous resource-intensive tasks that are executed in parallel. The pool only starts new tasks if there is enough free CPU and memory available and the Javascript event loop is not blocked. For more information, see the [`AutoscaledPool`](https://sdk.apify.com/docs/api/autoscaledpool) object in the Apify SDK.

- ##### **`Global Store: Object`**
 
  Represents an in-memory store that can be used to share data across page function invocations, e.g. state variables, API responses, or other data. The `globalStore` object has an interface similar to JavaScript's [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) object, with a few important differences:
  - All `globalStore` functions are `async`; use `await` when calling them.
  - Keys must be strings and values must be JSON stringify-able.
  - The `forEach()` function is not supported.
  
  Note that stored data is not persisted. If the actor run is restarted or migrated to another worker server,
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

- ##### **`log: Object`**

  An object containing logging functions, with the same interface as provided by the 
  [`Apify.utils.log`](https://sdk.apify.com/docs/api/log) object in the Apify SDK. The log messages are written directly to the actor run log, which is useful for monitoring and debugging.
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
    log.exception(e, 'Exception occurred', { details: 'This is really bad!' });
  }
  ```

- ##### **`Apify: Object`**

  A reference to the full power of the Apify SDK. See [`the docs`](https://sdk.apify.com/docs/api/apify) for more information and all the available functions and classes.

  **Caution:** Since we're making the full SDK available, and Cheerio Scraper runs using the SDK, some edge case manipulations may lead to inconsistencies. Use `Apify` with caution and avoid making global changes unless you're confident.

- ##### **`cheerio: Object`**

  The [`Cheerio`](https://cheerio.js.org) module. Being the server-side version of the [jQuery](https://jquery.com) library, Cheerio features a very similar API with nearly identical selector implementation. This means DOM traversing, manipulation, querying, and data extraction are just as easy as with jQuery. 

  Example:
  ```javascript
  //The preferred method of loading the HTML
  //It loads the HTML code as a string, returning a Cheerio instance
  const cheerio = require('cheerio');
  const $ = cheerio.load('<h2 class="title">Hello world</h2>');
  ```

## Proxy configuration

The **Proxy configuration** (`proxyConfiguration`) option enables you to set
proxies that will be used by the scraper in order to prevent its detection by target websites.
You can use both the [Apify Proxy](https://apify.com/proxy) and custom HTTP or SOCKS5 proxy servers.

The following table lists the available options of the proxy configuration setting:

<table class="table table-bordered table-condensed">
    <tbody>
    <tr>
        <th><b>None</b></td>
        <td>
            The scraper will not use any proxies.
            All web pages will be loaded directly from IP addresses of Apify servers running on Amazon Web Services.
        </td>
    </tr>
    <tr>
        <th><b>Apify&nbsp;Proxy&nbsp;(automatic)</b></td>
        <td>
            The scraper will load all web pages using the <a href="https://apify.com/proxy">Apify Proxy</a>
            in automatic mode. In this mode, the proxy uses all proxy groups that are available to the user. For each new web page it automatically selects the proxy that hasn't been used in the longest time for the specific hostname in order to reduce the chance of detection by the website.
            You can view the list of available proxy groups on the <a href="https://my.apify.com/proxy" target="_blank" rel="noopener">Proxy</a> page in the app.
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
            <pre><code class="language-none">http://bob:password@proxy1.example.com:8000
            http://bob:password@proxy2.example.com:8000</code></pre>
        </td>
    </tr>
    </tbody>
</table>

The proxy configuration can be set programmatically when calling the actor using the API
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

## Results

The scraping results returned by [**Page function**](#page-function) are stored in the default dataset associated with the actor run, from where you can export them to formats such as JSON, XML, CSV or Excel.
For each object returned by the [**Page function**](#page-function), Cheerio Scraper pushes one record into the dataset and extends it with metadata such as the URL of the web page where the results come from.

For example, if your page function returned the following object:

```js
{
  message: 'Hello world!'
}
```

The full object stored in the dataset will look as follows
(in JSON format, including the metadata fields `#error` and `#debug`):

```json
{
  "title": "Hello world!",
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
[Get dataset items](https://apify.com/docs/api/v2#/reference/datasets/item-collection)
API endpoint:

```
https://api.apify.com/v2/datasets/[DATASET_ID]/items?format=json
```

where `[DATASET_ID]` is the ID of the actor's run dataset, in which you can find the Run object returned when starting the actor. Alternatively, you'll find the download links for the results in the Apify app.

To skip the `#error` and `#debug` metadata fields from the results and not include empty result records,
simply add the `clean=true` query parameter to the API URL, or select the  **Clean items** option when downloading the dataset in the Apify app.

To get the results in other formats, set the `format` query parameter to `xml`, `xlsx`, `csv`, `html`, etc.
For more information, see [Datasets](https://apify.com/docs/storage#dataset) in documentation
or the [Get dataset items](https://apify.com/docs/api/v2#/reference/datasets/item-collection)
endpoint in Apify API reference.


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
