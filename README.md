# Apify Crawler

<!-- toc -->

- [How it works](#how-it-works)
- [Input](#input)
- [Page function](#page-function)
  * [`context`](#context)
    + [Data structures:](#data-structures)
    + [Functions:](#functions)
    + [Class instances:](#class-instances)
      - [Global Store](#global-store)
- [Output](#output)
  * [Dataset](#dataset)

<!-- tocstop -->

## How it works
Crawler is a ready-made solution for crawling the web using the Chrome browser. It takes away all
the work necessary to set up a browser for crawling, controls the browser automatically and produces
machine readable results in several common formats.

Underneath, it uses the [Puppeteer](https://github.com/GoogleChrome/puppeteer/) library to control
the browser, but you don't need to worry about that. Using a simple web UI and a little of basic
JavaScript, you can tweak it to serve almost any scraping need.

If you need either a more performant, or a more powerful tool, see the 
[crawler-cheerio](https://www.apify.com/apify/crawler-cheerio) for unmatched performance,
or [crawler-puppeteer](https://www.apify.com/apify/crawler-puppeteer) for the full power of Puppeteer.

## Input
Input is provided via the pre-configured UI. See the tooltips for more info on the available options.

## Page function
Page function is a single JavaScript function that enables the user to control the Crawler's operation,
manipulate the crawled pages and extract data as needed. It is invoked with a `context` object
containing the following properties:

```js
const context = {
    // USEFUL DATA
    input, // Unaltered original input as parsed from the UI
    env, // Contains information about the run such as actorId or runId
    customData, // Value of the 'Custom data' Crawler option.
    request, // Apify.Request object.
    response, // Response object holding the status code and headers.
    
    // EXPOSED FUNCTIONS
    saveSnapshot, // Saves a screenshot and full HTML of the current page to the key value store.
    skipLinks, // Prevents enqueueing more links via Pseudo URLs on the current page.
    skipOutput, // Prevents saving the return value of the pageFunction to the default dataset.
    enqueuePage, // Adds a page to the request queue.
    jQuery, // A reference to the jQuery $ function (if injectJQuery was used).
    
    // EXPOSED OBJECTS
    globalStore, // Represents an in memory store that can be used to share data across pageFunction invocations.
    requestList, // Reference to the run's default Apify.RequestList.
    requestQueue, // Reference to the run's default Apify.RequestQueue.
    dataset, // Reference to the run's default Apify.Dataset.
    keyValueStore, // Reference to the run's default Apify.KeyValueStore.
    log, // Reference to Apify.utils.log 
    underscoreJs, // A reference to the Underscore _ object (if injectUnderscore was used).
}
```
### `context`
The following tables describe the `context` object in more detail.

#### Data structures:
<table>
<thead>
    <tr><td>Argument</td><td>Type</td></tr>
</thead>
<tbody>
    <tr><td><code>input</code></td><td><code>string</code></td></tr>
    <tr><td colspan="2">
        Raw input as it was received from the UI, represented as a <code>string</code> for immutability.
        You can <code>JSON.parse()</code> it to get the values of individual configuration options.
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
        specific use cases. If you need to pass arbitrary data to the crawler, use the Custom data input field
        and its contents will be available under the <code>customData</code> context key.
    </td></tr>
    <tr><td><code>request</code></td><td><code>Request</code></td></tr>
    <tr><td colspan="2">
        Apify uses a <code>request</code> object to represent metadata about the currently crawled page,
        such as its URL or the number of retries. See the
        <a href="https://sdk.apify.com/docs/api/request" target="_blank"><code>Request</code></a>
        class for a preview of the structure and full documentation.
    </td></tr>
    <tr><td><code>response</code></td><td><code>{status: number, headers: Object}</code></td></tr>
    <tr><td colspan="2">
        The HTTP response object is produced by Puppeteer. Currently, we only pass the HTTP status code
        and the response headers to the <code>context</code>.
    </td></tr>
</tbody>
</table>

#### Functions:
<table>
<thead>
    <tr><td>Argument</td><td>Type</td></tr>
</thead>
<tbody>
    <tr><td><code>saveSnapshot</code></td><td><code>Function</code></td></tr>
    <tr><td colspan="2">
        A helper function that enables saving a snapshot of the current page's HTML and its screenshot
        into the default key value store. Each snapshot overwrites the previous one and the function's
        invocations will also be throttled if invoked more than once in 2 seconds, to prevent abuse.
        So make sure you don't call it for every single request. You can find the screenshot under
        the SNAPSHOT-SCREENSHOT key and the HTML under the SNAPSHOT-HTML key.
    </td></tr>
    <tr><td><code>skipLinks</code></td><td><code>Function</code></td></tr>
    <tr><td colspan="2">
        With each invocation of the <code>pageFunction</code> the crawler attempts to extract
        new URLs from the page using the Link selector and PseudoURLs provided in the input UI.
        If you want to prevent this behavior in certain cases, call the <code>skipLinks</code>
        function and no URLs will be added to the queue for the given page.
    </td></tr>
    <tr><td><code>skipOutput</code></td><td><code>Function</code></td></tr>
    <tr><td colspan="2">
        Since each return value of the <code>pageFunction</code> is saved to the default dataset,
        this provides a way of overriding that functionality. Just call <code>skipOutput</code>
        and the result of the current invocation will not be saved to the dataset.
    </td></tr>
    <tr><td><code>enqueuePage</code></td><td><code>Function</code></td></tr>
    <tr><td colspan="2">
        To enqueue a specific URL manually instead of automatically by a combination of a Link selector
        and a Pseudo URL, use the <code>enqueuePage</code> function. It accepts a plain object as argument
        that needs to have the structure to construct a
        <a href="https://sdk.apify.com/docs/api/request" target="_blank"><code>Request</code></a> object.
        But frankly, you just need a URL: <code>{ url: 'https://www.example.com }</code>
    </td></tr>
    <tr><td><code>jQuery</code></td><td><code>Function</code></td></tr>
    <tr><td colspan="2">
        To make the DOM manipulation within the page easier, you may choose the <code>injectJQuery</code>
        option in the UI and all the crawled pages will have an instance of the
        <a href="https://sdk.apify.com/docs/api/request" target="_blank"><code>jQuery</code></a> library
        available. However, since we do not want to modify the page in any way, we don't inject it
        into the global <code>$</code> object as you may be used to, but instead we make it available
        in <code>context</code>. Feel free to <code>const $ = context.jQuery</code> to get the familiar notation.
    </td></tr>
</tbody>
</table>

#### Class instances:
##### Global Store
`globalStore` represents an instance of a very simple in memory store that is not scoped to the individual
`pageFunction` invocation. This enables you to easily share global data such as API responses, tokens and other.
Since the stored data need to cross the from the Browser to the Node.js process, they cannot be any data,
but always need to be JSON stringifiable. Therefore, you cannot store DOM objects, live class instances,
functions etc. Only a JSON representation of the passed object will be stored, with all the relevant limitations.

<table>
<thead>
    <tr><td>Method</td><td>Return Type</td></tr>
</thead>
<tbody>
    <tr><td><code>get(key:string)</code></td><td><code>Promise&lt;Object&gt;</code></td></tr>
    <tr><td colspan="2">
        Retrieves a JSON serializable value from the global store using the provided key.
    </td></tr>
    <tr><td><code>set(key:string, value:Object)</code></td><td><code>Promise</code></td></tr>
    <tr><td colspan="2">
        Saves a JSON serializable value to the global store using the provided key.
    </td></tr>
    <tr><td><code>size()</code></td><td><code>Promise&lt;number&gt;</code></td></tr>
    <tr><td colspan="2">
        Returns the current number of values in the global store.
    </td></tr>
    <tr><td><code>list()</code></td><td><code>Promise&lt;Array&gt;</code></td></tr>
    <tr><td colspan="2">
        Returns all the keys currently stored in the global store.
    </td></tr>
</tbody>
</table>

## Output

Ouput is a dataset containing extracted data for each scraped page.

### Dataset
For each of the scraped URLs, the dataset contains an object with results and some metadata.
If you were scraping the HTML `<title>` of [IANA](https://www.iana.org/) it would look like this:

```json
{
  "title": "Internet Assigned Numbers Authority",
  "#error": false,
  "#debug": {
    "url": "https://www.iana.org/",
    "method": "GET",
    "retryCount": 0,
    "errorMessages": null,
    "requestId": "e2Hd517QWfF4tVh"
  }
}
```

<<<<<<< HEAD
* pass **ID** of own **crawler** and act fetches the configuration from that crawler. You can override any attribute you want in the act input: 

  ```json
  {
    "crawlerId": "snoftq230dkcxm7w0",
    "clickableElementsSelector": "a"
  }
  ```

This acts persists it's state in key-value store during the run and finally stores the results in files `RESULTS-1.json`, `RESULTS-2.json`, `RESULTS-3.json`,  … .

## Input attributes

#### Crawler compatible attributes

Act supports following crawler configuration attributes (for documentation see https://www.apify.com/docs/crawler#home):

| Attribute                 | Type                             | Default | Required | Description                              |
| ------------------------- | -------------------------------- | ------- | -------- | ---------------------------------------- |
| startUrls                 | `[{key: String, value: String}]` | `[]`    | yes      |                                          |
| pseudoUrls                | `[{key: String, value: String}]` |         |          |                                          |
| clickableElementsSelector | `String`                         |         |          | Currently supports only links (`a` elements) |
| pageFunction              | `Function`                       |         | yes      |                                          |
| interceptRequest          | `Function`                       |         |          |                                          |
| injectJQuery              | `Boolean`                        |         |          |                                          |
| injectUnderscore          | `Boolean`                        |         |          |                                          |
| maxPageRetryCount         | `Number`                         | `3`     |          |                                          |
| maxParallelRequests       | `Number`                         | `1`     |          |                                          |
| maxCrawledPagesPerSlave   | `Number`                         | `50`    |          |                                          |
| pageLoadTimeout           | `Number`                         | `30s`   |          |                                          |
| customData                | `Any`                            |         |          |                                          |
| maxCrawledPages           | `Number`                         |         |          |                                          |
| maxOutputPages            | `Number`                         |         |          |                                          |
| considerUrlFragment       | `Boolean`                        | `false` |          |                                          |
| maxCrawlDepth             | `Number`                         |         |          |                                          |
| maxInfiniteScrollHeight   | `Number`                         |         |          |                                          |
| cookies                   | `[Object]`                       |         |          | Currently used for all requests          |
| pageFunctionTimeout       | `Number`                         | `60000` |          |                                          |
| disableWebSecurity        | `Boolean`                        | `false` |          |                                          |

#### Additional attributes

| Attribute             | Type     | Default | Required | Description                              |
| ----------------------| -------- | ------- | -------- | ---------------------------------------- |
| maxPagesPerFile       | `Number` | `1000`  | yes      | Number of outputed pages saved into 1 results file. |
| browserInstanceCount  | `Number` | `10`    | yes      | Number of browser instances to be used in the pool. |
| crawlerId             | `String` |         |          | ID of a crawler to fetch configuration from. |
| urlList               | `String` |         |          | Url of the file containing urls to be enqueued as `startUrls`. This file must either contain one url per line or `urlListRegExp` configuration attribute must be provided. |
| urlListRegExp         | `String` |         |          | RegExp to match array of urls from `urlList` file ^.<br /><br />This RegExp is used this way against the file and must return array of url strings: `contentOfFile.match(new RegExp(urlListRegExp, 'g'));`<br /><br />For example `(http|https)://[\\w-]+(\\.[\\w-]+)+([\\w-.,@?^=%&:/~+#-]*[\\w@?^=%&;/~+#-])?` to simply match any http/https urls. |
| userAgent             | `String`   |         |          | User agent to be used in browser |
| customProxies         | `[String]` |         |          | Array of proxies to be used for browsing. |
| dumpio                | `Boolean`  | true    |          | If `true` then Chrome console log will be piped into act run log. |
| saveSimplifiedResults | `Boolean`  | false   |          | If `true` then also simplified version of results will be outputted. |
| fullStackTrace        | `Boolean`  | false   |          | If `true` then `request.errorInfo` and act log will contain full stack trace of each error. |

## Local usage

To run act locally you must have [**NodeJS**](https://nodejs.org/en/) installed:

* Clone this repository: `git clone https://github.com/apifytech/act-crawler.git`
* Install dependencies: `npm install`
* Configure input in `/kv-store-dev/INPUT`
* Run it: `npm run local` 
=======
The metadata are prefixed with a `#`. Soon you will be able to exclude the metadata
from the results by providing an API flag.
