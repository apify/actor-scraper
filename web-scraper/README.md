# Web Scraper

Web Scraper is a generic easy-to-use actor for crawling arbitrary web pages
and extracting structured data from them using a few lines of JavaScript code.
It loads web pages in the Chrome browser and renders dynamic content.
Web Scraper can either be configured and run manually in a user interface, or programmatically using API.
The extracted data is stored in a dataset, from where it can exported to various formats,
such as JSON, XML, or CSV.

If you're not familiar with web scraping or front-end web development,
you might prefer to first
read the [**Web scraping tutorial**](https://apify.com/docs/scraping/web-scraper-tutorial)
in Apify documentation,
which will walk you through all the steps and provide examples.

## Table of content

<!-- toc -->

- [Usage](#usage)
- [Limitations](#limitations)
- [Input configuration](#input-configuration)
  * [Start URLs](#start-urls)
  * [Use request queue](#use-request-queue)
  * [Link selector](#link-selector)
  * [Pseudo-URLs](#pseudo-urls)
  * [Page function](#page-function)
- [Results](#results)
- [Next steps](#next-steps)

<!-- tocstop -->

## Usage

To get started with Web Scraper,
you only need two things. First, tell the scraper which web pages
it should load, and second, tell it how to extract data from each of the pages. 

The scraper starts by loading pages specified in
the [**Start URLs**](#start-urls) input setting.
Optionally, you can make it follow page links on the fly
by enabling the [**Use request queue**](#use-request-queue) option.
Then just set <a href="#link-selector"><b>Link selector</b></a>
and/or <a href="#pseudo-urls"><b>Pseudo-URLs</b></a>
to tell the scraper which links it should follow.
This is useful for recursive crawling of entire websites,
e.g. to find all products in an online store.

To tell the scraper how to extract data from web pages,
you need to provide <a href="#page-function"><b>Page function</b></a>.
It is a JavaScript code that is executed in the context
of every web page loaded.
Since the scraper uses the full-featured Chrome browser,
writing Page function
is equivalent to developing a front-end code
and you can use client-side libraries such as
<a href="http://jquery.com" target="_blank" rel="noopener">jQuery</a>.

In summary, Web Scraper works as follows:

1. Add each of <a href="#start-urls">Start URLs</a> to the crawling queue.
2. Fetch the first URL from the queue and load it in Chrome browser
3. Execute <a href="#page-function">Page function</a> on the loaded page and save its results.
4. Optionally, find all links from the page using <a href="#link-selector">Link selector</a>.
   If a link matches any of the <a href="#pseudo-urls">Pseudo-URLs</a>
   and has not yet been enqueued, add it to the queue.
5. If there are more items in the queue, repeat step 2, otherwise finish.

Web Scraper has a number of other configuration settings
to improve performance, set cookies for login to websites,
mask the web browser etc.
See [Input configuration](#input-configuraton) below
for the complete list of settings.

## Limitations

Web Scraper was designed to be generic and easy to use,
and as such might not be an ideal solution if your primary concern
is performance or flexibility.

The actor employs a full-featured Chrome web browser,
which is resource-intensive and might be an overkill
for websites that do not render the content dynamically
using client-side JavaScript.
To achieve better performance for scraping these sites,
you might prefer to use
**Cheerio Scraper** ([apify/cheerio-scaper](https://apify.com/apify/cheerio-scraper)),
which downloads and processes raw HTML pages without overheads of
a full web browser.

Web Scraper's **Page function** is executed in the context
of the web page, and therefore it only supports a client-side JavaScript code.
If you need to use some server-side libraries or have more control
of the Chrome browser using the underlying
[Puppeteer](https://github.com/GoogleChrome/puppeteer/) library,
you might prefer to use
**Puppeteer Scraper** ([apify/puppeteer-scaper](https://apify.com/apify/cheerio-scraper)).
For even more flexibility, you might develop
a new actor from scratch in Node.js using [Apify SDK](https://sdk.apify.com).

## Input configuration

On input, the Web Scraper actor accepts number of configuration options.
They can be entered either manually in the user interface,
or programmatically in a JSON object using the [Apify API](https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor).
For a complete list of input fields and their type, please see [Input](https://apify.com/apify/web-scraper?section=input-schema).

### Start URLs

The **Start URLs** (`startUrls`) field represent the list of URLs
of the first pages that the scraper will open.
You can either enter these URLs manually one by one, upload them in a CSV file or
[link URLs from a Google Sheet](https://help.apify.com/en/articles/2906022-scraping-a-list-of-urls-from-google-spreadsheet)
document.
Each URL must start with either a `http://` or `https://` protocol prefix.

Optionally, each URL can be associated with a custom user data - a JSON object that can be referenced from
your JavaScript code in [**Page function**](#page-function) as <code>context.request.userData</code>.
This is useful to determine which start URL is currently loaded
in order to perform some page-specific actions.
For example, when crawling an online store, you might want to perform different
actions on a page listing the products vs. a product detail page.
For details, see [**Web scraping tutorial**](https://apify.com/docs/scraping/tutorial/introduction#the-start-url)
in Apify documentation.

### Use request queue

The **Use request queue** (`useRequestQueue`) option determines whether
the scraper will use a dynamic queue to manage URLs,
in addition to the static list of [**Start URLs**](#start-urls).
If the option is enabled, the scraper will support adding new URLs to scrape on the fly, either using the
[**Link selector**](#link-selector) and [**Pseudo-URLs**](#pseudo-urls) options
or by calling <code>context.enqueueRequest()</code>
inside [**Page function**](#page-function). Use of the request queue has some overheads, so only enable this option
if you need to add URLs dynamically.

### Link selector

The **Link selector** (`linkSelector`) field contains a CSS selector used to find links to other web pages,
i.e. `<a>` elements with `href` attribute.
This setting only applies if the [**Use request queue**](#use-request-queue) option is enabled,
otherwise it is ignored and no links are followed.

On every page loaded, the scraper looks for all links matching **Link selector**,
checks that the target URL matches one of the [**Pseudo-URLs**](#pseudo-urls),
and if so then adds the URL to the request queue,
so that it's loaded by the scraper later.

By default, new scrapers are created with the following selector that matches all links:

```
a[href]
```

If <b>Link selector</b> is empty, the page links are ignored,
and the scraper only loads pages that specified in [**Start URLs**](#start-urls)
or that are manually added to the request queue by calling <code>context.enqueueRequest()</code>
in [**Page function**](#page-function).

### Pseudo-URLs

The **Pseudo-URLs** (`pseudoUrls`) field specifies
what kind of URLs found by [**Link selector**](#link-selector) should be added to the request queue.
This setting only applies if the [**Use request queue**](#use-request-queue)
option is enabled.

A pseudo-URL (PURL) is simply a URL with special directives enclosed in `[]` brackets.
Currently, the only supported directive is `[regexp]`, which defines
a JavaScript-style regular expression to match against the URL.

For example, a PURL `http://www.example.com/pages/[(\w|-)*]` will match all of the
following URLs:

- `http://www.example.com/pages/`
- `http://www.example.com/pages/my-awesome-page`
- `http://www.example.com/pages/something`

If either `[` or `]` is part of the normal query string,
it must be encoded as `[\x5B]` or `[\x5D]`, respectively. For example,
the following PURL:

```
http://www.example.com/search?do[\x5B]load[\x5D]=1
```

will match the URL:

```
http://www.example.com/search?do[load]=1
```

Optionally, each PURL can be associated with a custom user data
that can be referenced from
your [**Page function**] using `context.customData`
to determine which kind of page is currently loaded in the browser.

Note that you don't need to use the **Pseudo-URLs** setting at all,
because you can completely control which pages the scraper will access
by calling `context.enqueuePage()` from [**Page function**](#page-function).

### Page function

The **Page function** (`pageFunction`) field 
contains a JavaScript function that is executed in the context
of every page loaded by Web Scraper in the Chrome browser.
The purpose of the page function is to extract
data from the web page, manipulate the DOM by clicking elements,
add new URLs to the request queue
and otherwise control Web Scraper's operation.

Example:

```ecmascript 6
async function pageFunction(context) {
    // jQuery is handy for finding DOM elements and extracing data from them.
    // To use it, make sure to enable the "Inject jQuery" option.
    const $ = context.jQuery;
    const pageTitle = $('title').text();

    // Print some information to actor log
    context.log.info(`URL: ${context.request.url} TITLE: ${pageTitle}`);

    // Manually add a new page to the scraping queue.
    // To make this work, make sure the "Use request queue" option is enabled.
    context.enqueueRequest({ url: 'http://www.example.com' });

    // Return an object with the data extracted from the page.
    // It will be stored to the resulting dataset.
    return {
        url: context.request.url,
        pageTitle
    };
}
```

The page function accepts a single argument, the `context` object,
whose properties are listed in the table below.
Since the function is executed in the context of the web page, it can access the DOM,
e.g. using the `window` or `document` global variables.

The return value of the page function is an object representing the data extracted from the web page.
The object must be stringify-able to JSON, i.e. it can only properties with basic types and no circular references.
If you don't want to extract any data from the page and skip it in the results, simply return `null` or `undefined`.

The page function supports the JavaScript ES6 syntax and is asynchronous, which means you can use the <code>await</code>
keyword to wait for background operations to finish.
To learn more about `async` functions,
see <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function">Mozilla documentation</a>.


**Properties of the `context` object:**

All of the functions are `async` so make sure to use `await` with their invocations.

<table>
<thead>
    <tr><th>Poperty</th><th>Type</th></tr>
</thead>
<tbody>
    <tr><td><code>customData</code></td><td><code>Object</code></td></tr>
    <tr><td colspan="2">
        Since the input UI is fixed, it does not support adding of other fields that may be needed for all
        specific use cases. If you need to pass arbitrary data to the scraper, use the Custom data input field
        and its contents will be available under the <code>customData</code> context key.
    </td></tr>
    <tr><td><code>enqueueRequest(request)</code></td><td><code>Function</code></td></tr>
    <tr><td colspan="2">
        (request: Request|Object, options: Object)
        To enqueue a specific URL manually instead of automatically by a combination of a Link selector
        and a Pseudo URL, use the <code>enqueueRequest</code> function. It accepts a plain object as argument
        that needs to have the structure to construct a
        <a href="https://sdk.apify.com/docs/api/request" target="_blank"><code>Request</code></a> object.
        But frankly, you just need a URL: <code>{ url: 'https://www.example.com }</code>
    </td></tr>
    <tr><td><code>env</code></td><td><code>Object</code></td></tr>
    <tr><td colspan="2">
        A map of all relevant values coming from `APIFY_` environment variables passed
        by Apify platform to the actor run. You can use it e.g. to get actor run ID, check its timeout etc.
        See the
        <a href="https://sdk.apify.com/docs/api/apify#module_Apify.getEnv" target="_blank"><code>Apify.getEnv()</code></a>
        function for a preview of the structure and full documentation.
    </td></tr>
    <tr><td><code>getValue(key)</code></td><td><code>Function</code></td></tr>
    <tr><td colspan="2">
        A map of all the relevant environment variables that you may want to use. See the
        <a href="https://sdk.apify.com/docs/api/apify#apifygetenv-code-object-code" target="_blank"><code>Apify.getEnv()</code></a>
        function for a preview of the structure and full documentation.
    </td></tr>
    <tr><td><code>globalStore</code></td><td><code>Object</code></td></tr>
    <tr><td colspan="2">
      // Represents an in memory store that can be used to share data across pageFunction invocations.
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
    </td></tr>
    <tr><td><code>input</code></td><td><code>Object</code></td></tr>
    <tr><td colspan="2">
      // Unaltered original input as parsed from the UI
      Input as it was received from the UI. Each <code>pageFunction</code> invocation gets a fresh
      copy and you can not modify the input by changing the values in this object.
    </td></tr>
    <tr><td><code>jQuery</code></td><td><code>Function</code></td></tr>
    <tr><td colspan="2">
      // A reference to the jQuery $ function (if Inject JQuery was used).
      To make the DOM manipulation within the page easier, you may choose the Inject jQuery
      option in the UI and all the crawled pages will have an instance of the
      <a href="https://api.jquery.com/" target="_blank"><code>jQuery</code></a> library
      available. However, since we do not want to modify the page in any way, we don't inject it
      into the global <code>$</code> object as you may be used to, but instead we make it available
      in <code>context</code>. Feel free to <code>const $ = context.jQuery</code> to get the familiar notation.
    </td></tr>
    <tr><td><code>log</code></td><td><code>Object</code></td></tr>
    <tr><td colspan="2">
      // Reference to Apify.utils.log
      `log` is a reference to
      <a href="https://sdk.apify.com/docs/api/log" target="_blank"><code>Apify.utils.log</code></a>.
      You can use any of the logging methods such as <code>log.info</code> or <code>log.exception</code>.
      <code>log.debug</code> is special, because you can trigger visibility of those messages in the
      scraper's Log by the provided **Debug log** input option.
    </td></tr>
    <tr><td><code>request</code></td><td><code>Object</code></td></tr>
    <tr><td colspan="2">
      // Apify.Request object
      Apify uses a `request` object to represent metadata about the currently crawled page,
      such as its URL or the number of retries. See the
      <a href="https://sdk.apify.com/docs/api/request" target="_blank"><code>Request</code></a>
      class for a preview of the structure and full documentation.
    </td></tr>
    <tr><td><code>response</code></td><td><code>Object</code></td></tr>
    <tr><td colspan="2">
      // Response object holding the status code and headers.
      The `response` object is produced by Puppeteer. Currently, we only pass the HTTP status code
      and the response headers to the `context`.
    </td></tr>
    <tr><td><code>saveSnapshot</code></td><td><code>Function</code></td></tr>
    <tr><td colspan="2">
      // Saves a screenshot and full HTML of the current page to the key value store.
      A helper function that enables saving a snapshot of the current page's HTML and its screenshot
      into the default key value store. Each snapshot overwrites the previous one and the function's
      invocations will also be throttled if invoked more than once in 2 seconds, to prevent abuse.
      So make sure you don't call it for every single request. You can find the screenshot under
      the SNAPSHOT-SCREENSHOT key and the HTML under the SNAPSHOT-HTML key.
    </td></tr>
    <tr><td><code>setValue(key: string, data: Object, options: Object)</code></td><td><code>Function</code></td></tr>
    <tr><td colspan="2">
      // Reference to the Apify.setValue() function.
      To save data to the default key-value store, you can use the <code>setValue</code> function.
      See the full documentation:
      <a href="https://sdk.apify.com/docs/api/apify#apifysetvaluekey-value-options-code-promise-code" target="_blank">
          <code>Apify.setValue()</code>
      </a> function.
    </td></tr>
    <tr><td><code>async skipLinks()</code></td><td><code>Function</code></td></tr>
    <tr><td colspan="2">
      // Prevents enqueueing more links via Pseudo URLs on the current page.
      With each invocation of the <code>pageFunction</code> the scraper attempts to extract
      new URLs from the page using the Link selector and PseudoURLs provided in the input UI.
      If you want to prevent this behavior in certain cases, call the <code>skipLinks</code>
      function and no URLs will be added to the queue for the given page.
    </td></tr>
    <tr><td><code>underscoreJs</code></td><td><code>Object</code></td></tr>
    <tr><td colspan="2">
      // A reference to the Underscore _ object (if Inject Underscore was used).
      <a href="https://underscorejs.org/" target="_blank">Underscore</a> is a helper library.
      You can use it in your `pageFunction` if you use the **Inject Underscore** input option.
    </td></tr>
    <tr><td><code>waitFor(task: number|string|Function, options: Object)</code></td><td><code>Function</code></td></tr>
    <tr><td colspan="2">
      // Helps with handling dynamic content by waiting for time, selector or function.
      The <code>waitFor</code> function enables you to wait
      for various events in the scraped page. The first argument determines its behavior.
      If you use a <code>number</code>, such as <code>await waitFor(1000)</code>, it will wait for the provided
      number of milliseconds. The other option is using a CSS selector <code>string</code>
      which will make the function wait until the given selector appears in the page. The final option
      is to use a <code>Function</code>. In that case, it will wait until the provided function returns 
      <code>true</code>.
    </td></tr>
</tbody>
</table>


## Results

Output is a dataset containing extracted data for each scraped page. To save data into
the dataset, return an `Object` or an `Object[]` from the `pageFunction`.

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


## Next steps

Congratulations! You've learned how Web Scraper works. You might also want to read about:

- [Web scraping tutorial](https://apify.com/docs/scraping)
- **Cheerio Scraper** ([apify/cheerio-scaper](https://apify.com/apify/cheerio-scraper))
- **Puppeteer Scraper** ([apify/puppeteer-scaper](https://apify.com/apify/puppeteer-scraper))
- [Apify SDK](https://sdk.apify.com)


