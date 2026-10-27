# Changelog

All notable changes to this project will be documented in this file.

## 1.0.23 (2026-10-27)

### ⚙️ Miscellaneous Tasks

- **generic:** Run Actors on patched Node 24.22.1 (#376)

## 1.0.22 (2026-09-08)

### 🐛 Bug Fixes

- **playwright-scraper:** Hold playwright at 1.61.1 (#363)

## 1.0.21 (2026-09-03)

### 🐛 Bug Fixes

- **scraper-tools:** Restore saveSnapshot() under content-type v2 (#361)

## 1.0.18 (2026-07-01)

### 🐛 Bug Fixes

- **scrapers:** Use RequestQueue directly to avoid excessive RQ writes on runs with large startUrls list (apify-sdk-js#393)
- **actors:** Deterministic monorepo builds + browser stack from digest-pinned bases

## 1.0.15 (2024-10-25)

- Updated Crawlee version to v3.11.5 and SDK v3.2.6
- Updated Node to v22

## 1.0.14 (2024-04-09)

- Updated Crawlee version to v3.8.0.
- Updated to use new request queue in scraper

## 1.0.11 (2023-08-22)

- Updated Crawlee version to v3.5.2.
- Updated Node.js version to v18.
- Added new options:
    - **Dismiss cookie modals** (`closeCookieModals`): Using the [I don't care about cookies](https://addons.mozilla.org/en-US/firefox/addon/i-dont-care-about-cookies/) browser extension. When on, the crawler will automatically try to dismiss cookie consent modals. This can be useful when crawling European websites that show cookie consent modals.
    - **Maximum scrolling distance in pixels** (`maxScrollHeightPixels`): The crawler will scroll down the page until all content is loaded or the maximum scrolling distance is reached. Setting this to `0` disables scrolling altogether.
    - **Exclude Glob Patterns** (`excludes`): Glob patterns to match links in the page that you want to exclude from being enqueued.

## 1.0

- Initial version built on Crawlee.
- Proxy usage is now required.
