# Sitemap Extractor

This Actor is designed to bridge the gap between discovery and crawling. By traversing a website's `sitemap.xml` structure, it compiles a comprehensive list of all published pages and verifies their status before you commit resources to a full-scale scrape.

## Features

- **Recursive Sitemap Discovery:** Automatically detects and traverses nested sitemaps (sitemap indexes).
- **Efficiency:** Uses HTTP HEAD requests for URL validation, which are significantly faster and consume less bandwidth than full GET requests.
- **Proxy Support:** Integrated with Apify Proxy to prevent rate limiting or blocking during the discovery phase.
- **Detailed Output:** Provides the final URL, the corresponding HTTP status code, and the date-time of the page's last modification.

## How it Works

1.  **Input:** You provide one or more "Start URLs" pointing to the domain name root, sitemaps or sitemap indexes.
2.  **Extraction:** The Actor parses the XML, extracting both page URLs and links to further sitemaps.
3.  **Validation:** For every page URL found, the Actor performs a status check.
4.  **Deduplication:** The crawler uses unique keys to ensure that even if a URL appears in multiple sitemaps, it is only checked once.

## Output

For each page URL, the Actor outputs:

| Field    |                                       Description                                       |
| :------- | :-------------------------------------------------------------------------------------: |
| `url`    |                                The page URL from the sitemap.                           |
| `status` |                       The HTTP status code returned by the HEAD request.                |
| `lastmod` | Best-effort last-modification time (ISO 8601). See the note below.                      |

### A note on last-modification data

The `lastmod` field is a single best-effort timestamp derived from two sources, in this order of preference:

1.  The `<lastmod>` tag declared for the URL in the sitemap.
2.  The `Last-Modified` HTTP header returned by the page (used only when the sitemap has no `<lastmod>`).

**We cannot guarantee that this information is available.** Both sources are optional: many sitemaps omit `<lastmod>` entirely, and a lot of servers don't send a `Last-Modified` header (this is especially common for dynamically generated pages). When neither source provides a value, `lastmod` is `null`. Even when present, the value is self-reported by the site and may not reflect the true last-modification time of the content.

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
