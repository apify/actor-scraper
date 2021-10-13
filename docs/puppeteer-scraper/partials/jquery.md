## [](#bonus-2-using-jquery-with-puppeteer-scraper)  Bonus 2: Using jQuery with Puppeteer Scraper

If you're familiar with the [jQuery library](https://jquery.com/), you may have looked at the scraping code and thought
that it's unnecessarily complicated. That's probably up to everyone to decide on their own, but the good news is,
you can easily use jQuery with Puppeteer Scraper too.

### [](#injecting-jquery) Injecting jQuery

To be able to use jQuery, we first need to introduce it to the browser. Fortunately, we have a helper function to
do just that: [`Apify.utils.puppeteer.injectJQuery`](https://sdk.apify.com/docs/api/puppeteer#puppeteerinjectjquerypage)

> Just a friendly warning. Injecting jQuery into a page may break the page itself, if it expects a specific version
of jQuery to be available and you override it with an incompatible one. So, be careful.

You can either call this function directly in your `pageFunction`, or you can set up jQuery injection in the
**Pre goto function** in the **Input and options** section.

```js
async function pageFunction(context) {
    const { Apify, page } = context;
    await Apify.utils.puppeteer.injectJQuery(page);

    // your code ...
}
```

```js
async function preGotoFunction({ page, Apify }) {
    await Apify.utils.puppeteer.injectJQuery(page);
}
```

The implementations are almost equal in effect. That means that in some cases, you may see performance differences,
or one might work while the other does not. Depending on the target website.

Let's try refactoring the Bonus 1 version of the `pageFunction` to use jQuery.

{{#code}}jquery.js{{/code}}

> There's an important takeaway from the example code. You can only use jQuery in the browser scope, even though you're
injecting it outside of the browser. We're using the [`page.evaluate()`](https://pptr.dev/#?product=Puppeteer&show=api-pageevaluatepagefunction-args)
function to run the script in the context of the browser and the return value is passed back to Node.js. Keep this in mind.
