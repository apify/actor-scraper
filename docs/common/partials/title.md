### Title
![actor title](../img/title-01.png "Finding actor title in DevTools.")

By using the element selector tool, we find out that the title is there under an `<h1>` tag, as titles should be.
Maybe surprisingly, we find that there are actually two `<h1>` tags on the detail page. This should get us thinking.
Is there any parent element that perhaps wraps all the information that we want to scrape? Yes, there is!
The `<div class="wrap">` is a common ancestor to everything. So let's start by getting that element first.

> Remember that you can press CTRL+F (CMD+F) in the Elements tab of DevTools to open the search bar 
where you can quickly search for elements using their selectors.

Using the search bar to find `div.wrap` in the DevTools reveals that it's not the only `div.wrap` in the page,
so we need to make the selector a little bit more specific by adding its parent element: `header div.wrap`.

![actor title selector](../img/title-02.png "Finding actor title in DevTools.")

{{#code}}title-1.js{{/code}}

> Always make sure to use the DevTools to verify your scraping process and assumptions. 
It's faster than changing the crawler code all the time.

Getting the title should now be pretty easy. We know that it's in the `$wrapper` so we just need to find it there:

{{#code}}title-2.js{{/code}}
