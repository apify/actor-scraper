## [](#getting-to-know-our-tools) Getting to know our tools

In the [Getting started with Apify scrapers](https://docs.apify.com/tutorials/apify-scrapers/getting-started) tutorial, we've confirmed that the scraper works as expected,
so now it's time to add more data to the results.

To do that, we'll be using the [Cheerio](https://github.com/cheeriojs/cheerio) library. This may not sound familiar,
so let's try again. Does [jQuery](https://jquery.com/) ring a bell? If it does you're in luck,
because Cheerio is just jQuery that doesn't need an actual browser to run. Everything else is the same.
All the functions you already know are there and even the familiar `$` is used. If you still have no idea what either
of those are, don't worry. We'll walk you through using them step by step.

> [Check out the Cheerio docs](https://github.com/cheeriojs/cheerio) to learn more about it.

Now that's out of the way, let's open one of the actor detail pages in the Store, for example the
**Web Scraper** ([apify/web-scraper](https://apify.com/apify/web-scraper)) page, and use our DevTools-Fu to scrape some data.

> If you're wondering why we're using Web Scraper as an example instead of Cheerio Scraper,
it's only because we didn't want to triple the number of screenshots we needed to make. Lazy developers!
