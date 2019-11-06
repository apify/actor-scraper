# Web Scraper

Web Scraper is a generic easy-to-use actor for crawling arbitrary web pages
and extracting structured data from them using a few lines of JavaScript code.
The actor loads web pages in the Chrome browser and renders dynamic content.
Web Scraper can either be configured and run manually in a user interface, or programmatically using API.
The extracted data is stored in a dataset, from where it can exported to various formats,
such as JSON, XML, or CSV.

If you're not familiar with web scraping or front-end web development in general,
you might prefer to start
with [**Web scraping tutorial**](https://apify.com/docs/scraping/web-scraper-tutorial)
in Apify documentation,
and then continue with [**Scraping with Web Scraper**](https://apify.com/docs/scraping/tutorial/web-scraper),
a tutorial which will walk you through all the steps and provide number of examples.

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
- [Additional resources](#additional-resources)

<!-- tocstop -->

## Usage

To get started with Web Scraper,
you only need two things. First, tell the scraper which web pages
it should load, and second, tell it how to extract data from each of the pages. 

The scraper starts by loading pages specified in
the [**Start URLs**](#start-urls) input setting.
Optionally, you can make the scraper follow page links on the fly
by enabling the [**Use request queue**](#use-request-queue) option.
Then just set <a href="#link-selector"><b>Link selector</b></a>
and/or <a href="#pseudo-urls"><b>Pseudo-URLs</b></a>
to tell the scraper which links it should add to the crawling queue.
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
   and has not yet been seen, add it to the queue.
5. If there are more items in the queue, repeat step 2, otherwise finish.

Web Scraper has a number of other configuration settings
to improve performance, set cookies for login to websites,
mask the web browser etc.
See [Input configuration](#input-configuration) below
for the complete list of settings.

## Limitations

Web Scraper is designed to be generic and easy to use,
and as such might not be an ideal solution if your primary concern
is performance or flexibility.

The actor employs a full-featured Chrome web browser,
which is resource-intensive and might be an overkill
for websites that do not render the content dynamically
using client-side JavaScript.
To achieve better performance for scraping such sites,
you might prefer to use
[**Cheerio Scraper**]((https://apify.com/apify/cheerio-scraper)) (`apify/cheerio-scaper`),
which downloads and processes raw HTML pages without overheads of
a full web browser.

Since Web Scraper's **Page function** is executed in the context
of the web page, it only supports a client-side JavaScript code.
If you need to use some server-side libraries or have more control
of the Chrome browser using the underlying
[Puppeteer](https://github.com/GoogleChrome/puppeteer/) library,
you might prefer to use
[**Puppeteer Scraper**](https://apify.com/apify/puppeteer-scraper) (`apify/puppeteer-scaper`).
For even more flexibility and control, you might develop
a new actor from scratch in Node.js using [Apify SDK](https://sdk.apify.com).

## Input configuration

On input, the Web Scraper actor accepts a number of configuration settings.
These can be entered either manually in the user interface in [Apify app](https://my.apify.com),
or programmatically in a JSON object using the [Apify API](https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor).
For a complete list of input fields and their type, please see [Input](https://apify.com/apify/web-scraper?section=input-schema).

### Start URLs

The **Start URLs** (`startUrls`) field represent the initial list of URLs
of pages that the scraper will visit.
You can either enter these URLs manually one by one, upload them in a CSV file or
[link URLs from a Google Sheet](https://help.apify.com/en/articles/2906022-scraping-a-list-of-urls-from-google-spreadsheet)
document.
Each URL must start with either a `http://` or `https://` protocol prefix.

Optionally, each URL can be associated with a custom user data - a JSON object that can be referenced from
your JavaScript code in [**Page function**](#page-function) under `context.request.userData`.
This is useful to determine which start URL is currently loaded,
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
inside [**Page function**](#page-function). Usage of the request queue has some overheads, so only enable this option
if you need to add URLs dynamically.

<!-- TODO: Describe how the queue works, unique key etc. plus link -->

### Link selector

The **Link selector** (`linkSelector`) field contains a CSS selector that is used to find links to other web pages,
i.e. `<a>` elements with the `href` attribute.
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
and the scraper only loads pages that were specified in [**Start URLs**](#start-urls)
or that were manually added to the request queue by calling <code>context.enqueueRequest()</code>
in [**Page function**](#page-function).

### Pseudo-URLs

The **Pseudo-URLs** (`pseudoUrls`) field specifies
what kind of URLs found by [**Link selector**](#link-selector) should be added to the request queue.
This setting only applies if the [**Use request queue**](#use-request-queue)
option is enabled.

A pseudo-URL is simply a URL with special directives enclosed in `[]` brackets.
Currently, the only supported directive is `[regexp]`, which defines
a JavaScript-style regular expression to match against the URL.

For example, a pseudo-URL `http://www.example.com/pages/[(\w|-)*]` will match all of the
following URLs:

- `http://www.example.com/pages/`
- `http://www.example.com/pages/my-awesome-page`
- `http://www.example.com/pages/something`

If either `[` or `]` is part of the normal query string,
it must be encoded as `[\x5B]` or `[\x5D]`, respectively. For example,
the following pseudo-URL:

```
http://www.example.com/search?do[\x5B]load[\x5D]=1
```

will match the URL:

```
http://www.example.com/search?do[load]=1
```

Optionally, each pseudo-URL can be associated with a user data
that can be referenced from
your [**Page function**](#page-function) using `context.request.userData`
to determine which kind of page is currently loaded in the browser.

Note that you don't need to use the **Pseudo-URLs** setting at all,
because you can completely control which pages the scraper will access
by calling `context.enqueuePage()` from [**Page function**](#page-function).

### Page function

The **Page function** (`pageFunction`) field 
contains a JavaScript function that is executed in the context
of every page loaded in the Chrome browser.
The purpose of this function is to extract
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

The return value of the page function is an object (or an array of objects) representing the data extracted from the web page.
The return value must be stringify-able to JSON, i.e. it can only contain basic types and no circular references.
If you don't want to extract any data from the page and skip it in the clean results, simply return `null` or `undefined`.

The page function supports the JavaScript ES6 syntax and is asynchronous, which means you can use the <code>await</code>
keyword to wait for background operations to finish.
To learn more about `async` functions,
see <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function">Mozilla documentation</a>.

#### Properties of the `context` object

- **`customData: Object`**

  Contains the object provided in the **Custom data** (`customData`) input setting.
  This is useful for passing dynamic parameters to your Web Scraper using API.
  
- **`enqueueRequest(request, [options]): AsyncFunction`**
  
  Adds a new URL to the request queue, if it wasn't already there.
  To call this function, the [**Use request queue**](#use-request-queue) option must be enabled, otherwise
  an error will be thrown.
  The `request` parameter is an object containing details of the request,
  with properties such as `url`, `userData`, `headers` etc.
  For the full list of the supported properties, see the 
  <a href="https://sdk.apify.com/docs/api/request" target="_blank"><code>Request</code></a> object's constructor in Apify SDK
  documentation.
  
  The optional `options` parameter is an object with additional options.
  Currently, it only supports the `forefront` boolean flag. If it's `true`,
  the request is added to the beginning of the queue. By default, requests are added to the end.
  
  Example:
  ```ecmascript 6
  await context.enqueueRequest({ url: 'https://www.example.com' });
  await context.enqueueRequest({ url: 'https://www.example.com/first' }, { forefront: true });
  ```
  
- **`env: Object`**

  A map of all relevant values passed down from the Apify platform to the actor run
  via the `APIFY_` environment variables.
  For example, you can find here information such as actor run ID, timeouts, actor run memory etc.
  For the full list of available values, see
  <a href="https://sdk.apify.com/docs/api/apify#module_Apify.getEnv" target="_blank"><code>Apify.getEnv()</code></a>
  function in Apify SDK.
  
  Example:
  ```ecmascript 6
  console.log(`Actor run ID: ${context.env.actorRunId}`);
  ```
 
- **`getValue(key): AsyncFunction`**

  Gets a value from the default key-value store associated with the actor run.
  The key-value store is useful for persisting various data, such as state objects, files etc.
  The function is very similar to <a href="https://sdk.apify.com/docs/api/apify#apifygetvaluekey-promise-object" target="_blank"><code>Apify.getValue()</code></a>
  function in Apify SDK.
  
  Note that there is also the dual `context.setValue(key, value)` function.
  
  Example:
  ```ecmascript 6
  const value = await context.getValue('my-key');
  console.dir(value);
  ```
  
- **`globalStore: Object`**
 
  Represents an in-memory store that can be used to share data across Page function invocations,
  such as state variables, API responses or other data.
  The `globalStore` has equivalent interface as JavaScript's 
  <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map" target="_blank"><code>Map</code></a> object,
  with a few important differences: 
  - All functions of `globalStore` are `async`. Use `await` when calling them.
  - Keys must be strings, and values need to be JSON stringify-able.
  - `forEach()` function is not supported.
  
  Note that the stored data is not persisted; if the actor run is restarted or migrated to another server,
  the content of `globalStore` is reset. Therefore, never depened on a specific value to be present
  in the store.
  
  Example:
  ```ecmascript 6
  let movies = await context.globalStore.get('cached-movies');
  if (!movies) {
    movies = await fetch('http://example.com/movies.json');
    await context.globalStore.set('cached-movies', movies);
  }
  console.dir(movies);
  ```

- **`input: Object`**

  An object containing the actor run input, i.e. the Web Scraper's configuration.
  Each page function invocation gets a fresh
  copy of this object, so changing `input` values has no effect.
  
- **`jQuery: Function`**

  A reference to the <a href="https://api.jquery.com/" target="_blank"><code>jQuery</code></a> function,
  which is extremely useful for DOM traversing, manipulation, querying and data extraction.
  This field is only available if the **Inject jQuery** option is enabled.
  
  Typically, the jQuery object is registered under a global variable called <code>$</code>.
  However, the web page might use this global variable for something else.
  To avoid conflicts, the jQuery object is not registered globally
  and is only available through the `context.jQuery` property.
  
  Example:
  ```ecmascript 6
  const $ = context.jQuery;
  const pageTitle = $('title').text();
  ```
  
- **`log: Object`**

  An object containing logging functions,
  with the same interface as provided by the 
  <a href="https://sdk.apify.com/docs/api/log" target="_blank"><code>Apify.utils.log</code></a>
  object in Apify SDK.
  The log messages are written directly to the actor run's log, which is useful for monitoring and debugging.
  Note that <code>log.debug()</code> only prints messages to log
  if the **Enable debug log** input configuration option is set.
  
  Example:
  ```ecmascript 6
  const log = context.log;
  log.debug('Debug message', { hello: 'world!' });
  log.info('Information message', { someData: 123 });
  log.warning('Warning message');
  log.error('Error message', { details: 'This is bad!' });
  try {
    throw new Error('Not good!');
  } catch (e) {
    log.exception(e, 'Exception occurred', { details: 'This is really bad!' });
  }
  ```
  
- **`request: Object`**
  
  The `Request` object containing information about the currently loaded web page,
  such as the URL, number of retries, a unique key etc.
  For the full list of properties, see <a href="https://sdk.apify.com/docs/api/request" target="_blank"><code>Request</code></a>
  in Apify SDK documentation.
  
- **`response: Object`**

  An object containing information about the HTTP response from the web server.
  Currently, the object only contains the `status` and `headers` properties.
  For example:
  
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
  
- **`saveSnapshot: AsyncFunction`**
    
  Saves a screenshot and full HTML of the current page to the key-value store
  associated with the actor run,
  under the `SNAPSHOT-SCREENSHOT` and  `SNAPSHOT-HTML` keys, respectively.
  This feature is useful when debugging your scraper.
  
  Note that each snapshot overwrites the previous one and the `saveSnapshot()`
  calls are throttled to at most one call in 2 seconds,
  in order to avoid excess usage of resources and slowdown of scraping.
  
- **`setValue(key, data, options): AsyncFunction`**

  Sets a value to the default key-value store associated with the actor run.
  The key-value store is useful for persisting various data, such as state objects, files etc.
  The function is very similar to <a href="https://sdk.apify.com/docs/api/apify#apifysetvaluekey-value-options-promise" target="_blank"><code>Apify.setValue()</code></a>
  function in Apify SDK.
  
  Note that there is also the dual `context.getValue(key)` function.
  
  Example:
  ```ecmascript 6
  await context.setValue('my-key', { hello: 'world' });
  ```
  
- **`skipLinks(): AsyncFunction`**

  Calling this function ensures that page links going from the current page
  will not be added to the request queue, even if they match [**Link selector**](#link-selector)
  and/or [**Pseudo-URLs**](#pseudo-urls) settings.
  This is useful to programmatically stop recursive crawling,
  e.g. if you know there are no more interesting links on the current page to follow.

- **`underscoreJs: Object`**

  A reference to the <a href="https://underscorejs.org/" target="_blank">Underscore.js</a> object,
  which provides various utility functions that you might find useful.
  This field is only available if the **Inject Underscore.js** option is enabled.
  
  Typically, the Underscore.js object is registered under a global variable called <code>_</code>.
  However, the web page might use this global variable for something else.
  To avoid conflicts, the Underscore.js object is not registered globally
  and is only available through the `context.underscoreJs` property.
  
  Example:
  ```ecmascript 6
  const _ = context.underscoreJs;
  const text = _.escape('<b>Tango & Cash</b>');
  ```
        
- **`waitFor(task, options): AsyncFunction`**

  A helper function that waits either a specific amount of time (in milliseconds), 
  for an element specified using a CSS selector to appear in the DOM
  or for a provided function to return `true`.
  This is useful for extracting data from web pages with a dynamic content,
  where the content might be available at the time when `pageFunction` is called.
  
  The `options` parameter is an object with the following properties and default values:
  ```ecmascript 6
  {
    // Maximum time to wait
    timeoutMillis: 20000,
  
    // How often to check if the condition changes
    pollingIntervalMillis: 50,
  }
  ```
  
  Example:
  ```ecmascript 6
  // Wait for selector
  await context.waitFor('.foo');
  // Wait for 1 second
  await context.waitFor(1000);
  // Wait for predicate
  await context.waitFor(() => !!document.querySelector('.foo'), { timeoutMillis: 5000 });
  ```

## Results

The scraping results returned by [**Page function**](#page-function)
are stored and in the default dataset associated with the actor run,
from where you can export them to formats such as JSON, XML, CSV or Excel.
For each object returned from the page function,
Web Scraper pushes one record into the dataset,
and extends it with metadata with some information about the web page where the results come from.

For example, if your Page function returned the following object:

```js
{
  message: 'Hello world!'
}
```

The full object stored in the dataset will look as follows (in JSON format, including the metadata fields `#error` and `#debug`):

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
[Get dataset items](https://apify.com/docs/api/v2#/reference/datasets/item-collection)
API endpoint:

```
https://api.apify.com/v2/datasets/[DATASET_ID]/items?format=json
```

where `[DATASET_ID]` is the ID of actor's run dataset,
which you can find the Run object returned when starting the actor.
Alternatively, you'll find the download links for the results in the Apify app.

To skip the `#error` and `#debug` metadata fields from the results and otherwise empty result records,
simply add the `clean=true` query parameter to the API URL,
or select the  **Clean items** option when downloading the dataset in the user interface.

To get the results in other formats, set `format` query parameter to `xml`, `xlsx`, `csv`, `html`, etc.
For full details, see the [Get dataset items](https://apify.com/docs/api/v2#/reference/datasets/item-collection)
endpoint in Apify API reference.


## Additional resources

Congratulations! You've learned how Web Scraper works. You might also want to check these resources:

- [Web scraping tutorial](https://apify.com/docs/scraping) -
  An introduction to web scraping with Apify.
- [Scraping with Web Scraper](https://apify.com/docs/scraping/tutorial/web-scraper) -
  A step-by-step tutorial how to use Web Scraper, with a detailed explanation and examples.
- [Cheerio Scraper](https://apify.com/apify/cheerio-scraper) (`apify/cheerio-scaper`) -
  A web scraping actor that downloads and processes pages in a raw HTML for a much higher performance. 
- [Puppeteer Scraper](https://apify.com/apify/puppeteer-scraper) (`apify/puppeteer-scaper`) - 
  An actor similar to Web Scraper, which provides a lower-level control of the underlying
  [Puppeteer](https://github.com/GoogleChrome/puppeteer) library and the ability to use server-side libraries.
- [Actors documentation](https://apify.com/docs/actor) -
  A documentation of the Apify Actors cloud computing platform.
- [Apify SDK](https://sdk.apify.com) - Learn how to build a new web scraping actor from scratch using the world's most 
  popular web crawling and scraping library for Node.js.


