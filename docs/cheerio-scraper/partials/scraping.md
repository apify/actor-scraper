## Scraping Title, Description, Last run date and Number of runs
In the Getting started with Apify scrapers tutorial, we've confirmed that the scraper works as expected,
so now it's time to add more data to the results.

To do that, we'll be using the [`Cheerio`](https://github.com/cheeriojs/cheerio) library. This may not sound familiar,
so let me try again. Does [`jQuery` library](https://jquery.com/) ring a bell? If it does you're in luck,
because `Cheerio` is just `jQuery` that doesn't need an actual browser to run. Everything else is the same.
All the functions you already know are there and even the familiar `$` is used. If you still have no idea what either
of those are, don't worry. We'll walk you through using them step by step.

> To learn more about `Cheerio`, see [the docs on their GitHub page](https://github.com/cheeriojs/cheerio).

Now that's out of the way, let's open one of the actor detail pages in the Store, for example the
[`apify/cheerio-scraper`](https://apify.com/apify/cheerio-scraper) page and use our DevTools-Fu
to figure out how to get the title of the actor.
