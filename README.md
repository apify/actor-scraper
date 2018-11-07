# REPLACE!!!

# Apify Crawler Cheerio

<!-- toc -->

- [How it works](#how-it-works)
- [Input](#input)
  * [Page function](#page-function)
- [Output](#output)
  * [Dataset](#dataset)

<!-- tocstop -->

## How it works

Crawler Cheerio is a ready-made solution for crawling the web using plain HTTP requests to retrieve HTML pages
and then parsing and inspecting the HTML using the [Cheerio](https://www.npmjs.com/package/cheerio) NPM package.

Cheerio is a server-side version of the popular [jQuery](https://jquery.com) library, that does not run in the
browser, but instead constructs a DOM out of a HTML string and then provides the user with API to work with that
DOM.

Crawler Cheerio is ideal for scraping websites that do not rely on client-side JavaScript to serve their content.
It can be as much as 20 times faster than using a full browser solution such as Puppeteer.

## Input
Input is provided via the pre-configured form. See the tooltips for more info on the available options.

### Page function
Page function enables the user to control the Crawler's operation, manipulate the received HTML
and extract data as needed. It is invoked with a `context` object containing the following properties:

```js
const context = {
    actorId, // ID of this actor.
    runId, // ID of the individual actor run.
    request, // Apify.Request object.
    response, // http.IncomingMessage object (Node.js server response).
    html, // The scraped HTML string.
    $, // Cheerio, with the HTML already loaded and ready to use.
    customData, // Value of the 'Custom data' Crawler option.
    requestList, // Reference to the run's default Apify.RequestList.
    requestQueue, // Reference to the run's default Apify.RequestQueue.
    dataset, // Reference to the run's default Apify.Dataset.
    keyValueStore, // Reference to the run's default Apify.KeyValueStore.
    input, // Unaltered original input as parsed from the UI.
    client, // Reference to the an instance of the Apify.client.
    log, // Reference to Apify.utils.log
    
    // Utility functions that simplify some common tasks.
    // See https://www.apify.com/docs/crawler#pageFunction for docs.
    skipLinks,
    skipOutput,
    willFinishLater,
    finish,
    enqueuePage,
}
```

## Output

Ouput is a dataset containing extracted data for each scraped page.

### Dataset
For each of the scraped URLs, the dataset contains an object with results.
If you were scraping the HTML `<title>` of [IANA](https://www.iana.org/) it would look like this:

```json
{
  "id": "e2Hd517QWfF4tVh",
  "url": "https://www.iana.org/",
  "uniqueKey": "https://www.iana.org",
  "method": "GET",
  "payload": null,
  "retryCount": 0,
  "errorMessages": null,
  "headers": {},
  "userData": {},
  "ignoreErrors": false,
  "handledAt": null,
  "pageFunctionResult": "Internet Assigned Numbers Authority"
}
```
