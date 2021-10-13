## [](#getting-to-know-our-tools) Getting to know our tools

In the [Getting started with Apify scrapers](https://apify.com/docs/scraping/tutorial/introduction) tutorial, we've confirmed that the scraper works as expected,
so now it's time to add more data to the results.

To do that, we'll be using the [Puppeteer library](https://github.com/GoogleChrome/puppeteer). Puppeteer is a browser
automation library that allows you to control a browser using JavaScript. That is, simulate a real human sitting
in front of a computer, using a mouse and a keyboard. It gives you almost unlimited possibilities, but you need to learn
quite a lot before you'll be able to use all of its features. We'll walk you through some of the basics of Puppeteer,
so that you can start using it for some of the most typical scraping tasks, but if you really want to master it,
you'll need to visit its [documentation](https://pptr.dev/) and really dive deep into its intricacies.

> The purpose of Puppeteer Scraper is to remove some of the difficulty faced when using Puppeteer by wrapping
it in a nice, manageable UI. It provides almost all of its features in a format that is much easier to grasp
when first trying to scrape using Puppeteer.

### [](#web-scraper-differences) Web Scraper differences

At first glance, it may seem like **Web Scraper** ([apify/web-scraper](https://apify.com/apify/web-scraper)) and Puppeteer Scraper are almost the same. Well, they are.
In fact, Web Scraper uses Puppeteer underneath. The difference is the amount of control they give you.
Where Web Scraper only gives you access to in-browser JavaScript and the `pageFunction` is executed
in the browser context, Puppeteer Scraper's `pageFunction` is executed in Node.js context, giving you
much more freedom to bend the browser to your will. You're the puppeteer and the browser is your puppet.
It's also much easier to work with external APIs, databases or the [Apify SDK](https://sdk.apify.com)
in the Node.js context. The tradeoff is simple. Power vs simplicity. Web Scraper is simple,
Puppeteer Scraper is powerful (and the [Apify SDK](https://sdk.apify.com) is super-powerful).

> Simply put, Web Scraper's `pageFunction` is just a single
[page.evaluate()](https://pptr.dev/#?product=Puppeteer&show=api-pageevaluatepagefunction-args) call.

Now that's out of the way, let's open one of the actor detail pages in the Store, for example the Web Scraper page and use our DevTools-Fu to scrape some data.

> If you're wondering why we're using Web Scraper as an example instead of Puppeteer Scraper,
it's only because we didn't want to triple the number of screenshots we needed to make. Lazy developers!
