# Migration from 1.x to 2.0

Main difference between v1 and v2 of the scrapers is the upgrade of SDK to v1.
Please refer to the [SDK 1.0 migration guide](https://sdk.apify.com/docs/guides/migration-to-v1) for more details about that change.

- deprecated `useRequestQueue` option has been removed
  - request queue will be always used
- deprecated `context.html` getter from the `cheerio-scraper` has been removed
  - use `context.body` instead
