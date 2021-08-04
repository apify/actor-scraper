# Migration from 1.x to 2.0

Main difference between v1 and v2 of the scrapers is the upgrade of SDK to v2,
which requires node v15.10+. SDK v2 uses http2 to do the requests with `cheerio-scraper`,
and the http2 support in older node versions were too buggy, so we decided to 
drop support for those. If you need to run on older node version, use SDK v1.

Please refer to the [SDK 1.0 migration guide](https://sdk.apify.com/docs/guides/migration-to-v1) for more details about functional changes in the SDK.
SDK v2 basically only changes the required node version and has no other breaking
changes. 

- deprecated `useRequestQueue` option has been removed
  - request queue will be always used
- deprecated `context.html` getter from the `cheerio-scraper` has been removed
  - use `context.body` instead
- deprecated `prepareRequestFunction` input option
  - use `pre/postNavigationHooks` instead
- removed `puppeteerPool`/`autoscaledPool` from the `crawlingContext` object
  - `puppeteerPool` was replaces by `browserPool`
  - `autoscaledPool` and `browserPool` and available on the `crawler` property of `crawlingContext` object
- custom "Key-value store name" option in Advanced configuration is now fixed, previously the default store was always used
