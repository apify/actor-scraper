## [](#pagination) Pagination

Pagination is just a term that represents "going to the next page of results". You may have noticed that we did not
actually scrape all the actors, just the first page of results. That's because to load the rest of the actors,
one needs to click the **Show more** button at the very bottom of the list. This is pagination.

> This is a typical form of JavaScript pagination, sometimes called infinite scroll. Other pages may just use links
that take you to the next page. If you encounter those, just make a **Pseudo URL** for those links and they will
be automatically enqueued to the request queue. Use a label to let the scraper know what kind of URL it's processing.

### [](#waiting-for-dynamic-content) Waiting for dynamic content

Before we talk about paginating, we need to have a quick look at dynamic content. Since Apify Store is a JavaScript
application (as many, if not most, modern websites are), the button might not exist in the page when the scraper
runs the `pageFunction`.

How is this possible? Because the scraper only waits with executing the `pageFunction` for the page to load its HTML.
If there's additional JavaScript that modifies the DOM afterwards, the `pageFunction` may execute before this
JavaScript had the time to run.

At first, you may think that the scraper is broken, but it just cannot wait for all the JavaScript in the page
to finish executing. For a lot of pages, there's always some JavaScript executing or some network requests being made.
It would never stop waiting. It is therefore up to you, the programmer, to wait for the elements you need.
Fortunately, we have an easy solution.
