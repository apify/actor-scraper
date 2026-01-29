# Sitemap Scraper

This Actor is designed to bridge the gap between discovery and crawling. By traversing a website's `sitemap.xml` structure, it compiles a comprehensive list of all published pages and verifies their status before you commit resources to a full-scale scrape.

## Features

- **Recursive Sitemap Discovery:** Automatically detects and traverses nested sitemaps (sitemap indexes).
- **Efficiency:** Uses HTTP HEAD requests for URL validation, which are significantly faster and consume less bandwidth than full GET requests.
- **Proxy Support:** Integrated with Apify Proxy to prevent rate limiting or blocking during the discovery phase.
- **Detailed Output:** Provides the final URL and the corresponding HTTP status code.

## How it Works

1.  **Input:** You provide one or more "Start URLs" pointing to the domain name root, sitemaps or sitemap indexes.
2.  **Extraction:** The Actor parses the XML, extracting both page URLs and links to further sitemaps.
3.  **Validation:** For every page URL found, the Actor performs a status check.
4.  **Deduplication:** The crawler uses unique keys to ensure that even if a URL appears in multiple sitemaps, it is only checked once.

## Usage

This Actor is ideal for:

- **Pre-crawling filter:** Generating a "clean" list of URLs for actors like _Website Content Crawler_ or _Web Scraper_.
- **SEO Audits:** Quickly identifying 404 Not Found or 500 Server Error pages listed in your sitemap.
- **Site Mapping:** Getting a high-level overview of a site's architecture.

## Configuration

|          Field          |                           Description                           |
| :---------------------: | :-------------------------------------------------------------: |
|     **Start URLs**      | Just a domain name or a list of sitemap XML URLs to start from. |
| **Proxy configuration** |                   Settings for Apify Proxies.                   |
