## [](#pagination) Pagination

Pagination is just a term that represents "going to the next page of results". You may have noticed that we did not
actually scrape all the actors, just the first page of results. That's because to load the rest of the actors,
one needs to click the **Show more** button at the very bottom of the list. This is pagination.

> This is a typical JavaScript pagination, sometimes called infinite scroll. Other pages may use links
that take you to the next page. If you encounter those, just make a Pseudo URL for those links and they
will be automatically enqueued to the request queue. Use a label to let the scraper know what kind of URL
it's processing.

If you paid close attention, you may now see a problem. How do we click a button in the page when we're working
with Cheerio? We don't have a browser to do it and we only have the HTML of the page to work with. So the simple
answer is that we can't click a button. Does that mean that we cannot get the data at all? Usually not,
but it requires some clever DevTools-Fu.

### [](#analyzing-the-page) Analyzing the page

While with Web Scraper and **Puppeteer Scraper** ([apify/puppeteer-scraper](https://apify.com/apify/puppeteer-scraper)), we could get away with simply clicking a button,
with Cheerio Scraper we need to dig a little deeper into the page's architecture. For this, we will use
the Network tab of the Chrome DevTools.

> DevTools is a powerful tool with many features, so if you're not familiar with it, please [see Google's tutorial](https://developers.google.com/web/tools/chrome-devtools/network/), which explains everything much better than we ever could.

We want to know what happens when we click the **Show more** button, so we open the DevTools **Network** tab and clear it.
Then we click the **Show more** button and wait for incoming requests to appear in the list.

![Inspecting network in DevTools](../img/inspect-network.webp)

Now, this is interesting. It seems that we've only received two images after clicking the button and no additional
data. This means that the data about actors must already be available in the page and the **Show more** button only displays it. This is good news.

### [](#finding-the-actors) Finding the actors

Now that we know the information we seek is already in the page, we just need to find it. The first actor in the store
is Web Scraper, so let's try using the search tool in the **Elements** tab to find some reference to it. The first
few hits do not provide any interesting information, but in the end, we find our goldmine. There is a `<script>` tag,
with the ID `__NEXT_DATA__` that seems to hold a lot of information about Web Scraper. In DevTools,
you can right click an element and click **Store as global variable** to make this element available in the **Console**.

![Finding the hidden actor data](../img/find-data.webp)

A `temp1` variable is now added to your console. We're mostly interested in its contents and we can get that using
the `temp1.textContent` property. You can see that it's a rather large JSON string. How do we know?
The `type` attribute of the `<script>` element says `application/json`. But working with a string would be very
cumbersome, so we need to parse it.

```js
const data = JSON.parse(temp1.textContent);
```

After entering the above command into the console, we can inspect the `data` variable and see that all the information
we need is there, in the `data.props.pageProps.items` array. Great!

![Inspecting the hidden actor data](../img/inspect-data.webp)

> It's obvious that all the information we set to scrape is available in this one data object,
so you might already be wondering, can I just make one request to the store to get this JSON
and then parse it out and be done with it in a single request? Yes you can! And that's the power
of clever page analysis.

### [](#using-the-data-to-enqueue-all-actor-details) Using the data to enqueue all actor details

We don't really need to go to all the actor details now, but for the sake of practice, let's imagine we only found
actor names such as `cheerio-scraper` and their owners, such as `apify` in the data. We will use this information
to construct URLs that will take us to the actor detail pages and enqueue those URLs into the request queue.

```js
// We're not in DevTools anymore,
// so we use Cheerio to get the data.
const dataJson = $('#__NEXT_DATA__').html();
// We requested HTML, but the data are actually JSON.
const data = JSON.parse(dataJson);

for (const item of data.props.pageProps.items) {
    const { name, username } = item;
    const actorDetailUrl = `https://apify.com/${username}/${name}`;
    await context.enqueueRequest({
        url: actorDetailUrl,
        userData: {
            // Don't forget the label.
            label: 'DETAIL',
        }
    });
}
```

We iterate through the items we found, build actor detail URLs from the available properties and then enqueue
those URLs into the request queue. We need to specify the label too, otherwise our page function wouldn't know
how to route those requests.

>If you're wondering how we know the structure of the URL, see the [Getting started
with Apify Scrapers](intro-scraper-tutorial) tutorial again.

### [](#plugging-it-into-the-page-function) Plugging it into the Page function

We've got the general algorithm ready, so all that's left is to integrate it into our earlier `pageFunction`.
Remember the `// Do some stuff later` comment? Let's replace it.

{{#code}}pagination.js{{/code}}

That's it! You can now remove the **Max pages per run** limit, **Save & Run** your task and watch the scraper
scrape all of the actors' data. After it succeeds, open the **Dataset** tab again click on **Preview**.
You should have a table of all the actor's details in front of you. If you do, great job! You've successfully
scraped Apify Store. And if not, no worries, just go through the code examples again, it's probably just some typo.

> There's an important caveat. The way we implemented pagination here is in no way a generic system that you can easily
use with other websites. Cheerio is fast (and that means it's cheap), but it's not easy. Sometimes there's just no way
to get all results with Cheerio only and other times it takes hours of research. Keep this in mind when choosing
the right scraper for your job. But don't get discouraged. Often times, the only thing you will ever need is to
define a correct Pseudo URL. So do your research first before giving up on Cheerio Scraper.
