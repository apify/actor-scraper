# Apify Web Scraper

<!-- toc -->

- [How it works](#how-it-works)
- [Getting Started](#getting-started)
- [Input](#input)
- [Page function](#page-function)
- [`context`](#context)
  * [Data structures](#data-structures)
  * [Functions](#functions)
  * [Class instances and namespaces](#class-instances-and-namespaces)
    + [Request](#request)
    + [Response](#response)
    + [Global Store](#global-store)
    + [Log](#log)
    + [Underscore](#underscore)
- [Output](#output)
  * [Dataset](#dataset)

<!-- tocstop -->

## How it works
Web Scraper is a ready-made solution for scraping the web using the Chrome browser. It takes away all
the work necessary to set up a browser for crawling, controls the browser automatically and produces
machine readable results in several common formats.

Underneath, it uses the [Puppeteer](https://github.com/GoogleChrome/puppeteer/) library to control
the browser, but you don't need to worry about that. Using a simple web UI and a little of basic
JavaScript, you can tweak it to serve almost any scraping need.

## Getting Started
If you're new to scraping or Apify, be sure to [visit our tutorial](https://apify.com/docs/scraping/web-scraper-tutorial)
to walk you through creating your first scraping task step by step.

## Input
Input is provided via the pre-configured UI. See the tooltips for more info on the available options.

## Page function
Page function is a single JavaScript function that enables the user to control the Scraper's operation,
manipulate the visited pages and extract data as needed. It is invoked with a `context` object
containing the following properties:

```js
const context = {
    // USEFUL DATA
    input, // Unaltered original input as parsed from the UI
    env, // Contains information about the run such as actorId or runId
    customData, // Value of the 'Custom data' scraper option.
    
    // EXPOSED OBJECTS
    request, // Apify.Request object.
    response, // Response object holding the status code and headers.
    globalStore, // Represents an in memory store that can be used to share data across pageFunction invocations.
    log, // Reference to Apify.utils.log 
    underscoreJs, // A reference to the Underscore _ object (if Inject Underscore was used).
    
    // EXPOSED FUNCTIONS
    setValue, // Reference to the Apify.setValue() function.
    getValue, // Reference to the Apify.getValue() function.
    saveSnapshot, // Saves a screenshot and full HTML of the current page to the key value store.
    waitFor, // Helps with handling dynamic content by waiting for time, selector or function.
    skipLinks, // Prevents enqueueing more links via Pseudo URLs on the current page.
    enqueueRequest, // Adds a page to the request queue.
    jQuery, // A reference to the jQuery $ function (if Inject JQuery was used).
    
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
    <tr><td><code>waitFor</code></td><td><code>(task: number|string|Function, options: Object)</code></td></tr>
    <tr><td colspan="2">
        The <code>waitFor</code> function enables you to wait
        for various events in the scraped page. The first argument determines its behavior.
        If you use a <code>number</code>, such as <code>await waitFor(1000)</code>, it will wait for the provided
        number of milliseconds. The other option is using a CSS selector <code>string</code>
        which will make the function wait until the given selector appears in the page. The final option
        is to use a <code>Function</code>. In that case, it will wait until the provided function returns 
        <code>true</code>.
    <tr><td><code>saveSnapshot</code></td><td></td></tr>
    <tr><td colspan="2">
        A helper function that enables saving a snapshot of the current page's HTML and its screenshot
        into the default key value store. Each snapshot overwrites the previous one and the function's
        invocations will also be throttled if invoked more than once in 2 seconds, to prevent abuse.
        So make sure you don't call it for every single request. You can find the screenshot under
        the SNAPSHOT-SCREENSHOT key and the HTML under the SNAPSHOT-HTML key.
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
    <tr><td><code>jQuery</code></td><td>see jQuery docs</td></tr>
    <tr><td colspan="2">
        To make the DOM manipulation within the page easier, you may choose the Inject jQuery
        option in the UI and all the crawled pages will have an instance of the
        <a href="https://api.jquery.com/" target="_blank"><code>jQuery</code></a> library
        available. However, since we do not want to modify the page in any way, we don't inject it
        into the global <code>$</code> object as you may be used to, but instead we make it available
        in <code>context</code>. Feel free to <code>const $ = context.jQuery</code> to get the familiar notation.
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
The `response` object is produced by Puppeteer. Currently, we only pass the HTTP status code
and the response headers to the `context`.

#### Global Store
`globalStore` represents an instance of a very simple in memory store that is not scoped to the individual
`pageFunction` invocation. This enables you to easily share global data such as API responses, tokens and other.
Since the stored data need to cross from the Browser to the Node.js process, it cannot be any kind of data,
but only JSON stringifiable objects. You cannot store DOM objects, functions, circular objects and so on.

`globalStore` supports the full
<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map" target="_blank">
<code>Map</code> API
</a>, with the following limitations:

   - All methods of `globalStore` are `async`. Use `await`.
   - Only `string` keys can be used and the values need to be JSON stringifiable.
   - `map.forEach()` is not supported.

#### Log
`log` is a reference to
<a href="https://sdk.apify.com/docs/api/log" target="_blank"><code>Apify.utils.log</code></a>.
You can use any of the logging methods such as <code>log.info</code> or <code>log.exception</code>.
<code>log.debug</code> is special, because you can trigger visibility of those messages in the
scraper's Log by the provided **Debug log** input option.

#### Underscore
<a href="https://underscorejs.org/" target="_blank">Underscore</a> is a helper library.
You can use it in your `pageFunction` if you use the **Inject Underscore** input option.

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
