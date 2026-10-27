# Changelog

All notable changes to this project will be documented in this file.


## 0.1.31 (2026-10-27)

### 🚀 Features

- **sitemap:** Add lastmod to extracted page output (#301)
- **sitemap-scraper:** Add option to list sitemap URLs only (#332)

### 🐛 Bug Fixes

- **sitemap-scraper:** Bump @crawlee&#x2F;utils to support `sitemap_index.xml`
- **sitemap-scraper:** Restore sitemap discovery timeout after merge conflict
- **sitemap-scraper:** Remove skipNavigation and parse sitemap from body
- **sitemap-scraper:** Remove proxy input and enforce stateless no-cookie sitemap discovery
- **sitemap-scraper:** Disable cookies for impit-based sitemap discovery
- **sitemap-scraper:** Allow rss&#x2F;atom&#x2F;text sitemap mime types in crawler
- **sitemap-scraper:** Support gzipped sitemap bodies without refetching
- **sitemap-extractor:** Retry discovery once without proxy
- **actors:** Deterministic monorepo builds + browser stack from digest-pinned bases
- **deps:** Dedupe puppeteer to a single 25.2.0, revert type workarounds
- **scraper-tools:** Restore saveSnapshot() under content-type v2 (#361)


Releases made before this changelog was introduced are not documented.
