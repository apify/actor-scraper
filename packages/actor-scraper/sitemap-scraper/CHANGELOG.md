# Changelog

All notable changes to this project will be documented in this file.

## 0.1.31 (2026-10-27)

_Maintenance build: dependency updates, no user-facing changes._

## 0.1.30 (2026-09-03)

### 🐛 Bug Fixes

- **scraper-tools:** Restore saveSnapshot() under content-type v2 (#361)

## 0.1.28 (2026-07-21)

### 🚀 Features

- **sitemap-scraper:** Add option to list sitemap URLs only (#332)

## Before 0.1.28 (2026-01-20 – 2026-07-09)

_The builds before 0.1.28 are no longer on the Apify platform, so these changes are not split by build._

### 🚀 Features

- **sitemap:** Add lastmod to extracted page output (#301)

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
