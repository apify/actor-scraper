## [](#getting-to-know-our-tools) Getting to know our tools

In the [Getting started with Apify scrapers](https://apify.com/docs/scraping/tutorial/introduction) tutorial,
we've confirmed that the scraper works as expected, so now it's time to add more data to the results.

To do that, we'll be using the [jQuery library](https://jquery.com/), because it provides some nice tools
and a lot of people familiar with JavaScript already know how to use it.

> [Check out the jQuery docs](https://api.jquery.com/) if you're not familiar with it. And if you just don't want to use it, that's okay. Everything can be done using pure JavaScript, too.

To add jQuery, all we need to do is turn on **Inject jQuery** under the  **Input and options** tab.
This will add a `context.jQuery` function that you can use.

Now that's out of the way, let's open one of the actor detail pages in the Store, for example
the [Web Scraper](https://apify.com/apify/web-scraper) page and use our DevTools-Fu to scrape some data.
