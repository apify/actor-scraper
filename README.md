# Apify Scrapers
This repository houses all of Apify generic actors that are used for simplified
scraping using a pre-defined, schema validated UI input instead of the typical
JSON input used in other actors.

## Web Scraper
**Web Scraper** ([apify/web-scraper](https://apify.com/apify/web-scraper)) is a ready-made solution for scraping the web using the Chrome browser. It takes away all the work necessary to set up a browser for crawling, controls the browser automatically and produces machine readable results in several common formats.

Underneath, it uses the Puppeteer library to control the browser, but you don't need to worry about that. Using a simple web UI and a little of basic JavaScript, you can tweak it to serve almost any scraping need.

## Puppeteer Scraper
**Puppeteer Scraper** ([apify/puppeteer-scraper](https://apify.com/apify/puppeteer-scraper)) is the most powerful scraper tool in our arsenal (aside from developing your own actors). It uses the Puppeteer library to programmatically control a headless Chrome browser and it can make it do almost anything. If using the Web Scraper does not cut it, Puppeteer Scraper is what you need.

Puppeteer is a Node.js library, so knowledge of Node.js and its paradigms is expected when working with the Puppeteer Scraper.

If you need either a faster, or a simpler tool, see the Cheerio Scraper for speed, or Web Scraper for simplicity.

## Cheerio Scraper
**Cheerio Scraper** ([apify/cheerio-scraper](https://apify.com/apify/cheerio-scraper)) is a ready-made solution for crawling the web using plain HTTP requests to retrieve HTML pages and then parsing and inspecting the HTML using the Cheerio library. It's blazing fast.

Cheerio is a server-side version of the popular jQuery library, that does not run in the browser, but instead constructs a DOM out of a HTML string and then provides the user with API to work with that DOM.

Cheerio Scraper is ideal for scraping websites that do not rely on client-side JavaScript to serve their content. It can be as much as 20 times faster than using a full browser solution such as Puppeteer.

## Scraper Tools
A library that houses logic common to all the scrapers.
