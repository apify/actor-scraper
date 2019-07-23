### Title
![actor title](../img/title.jpg "Finding actor title in DevTools.")

Let's start really easy. By using the element selector tool, we find out that the title is there under an `<h1>` tag,
as titles should be.

> Remember that you can press CTRL+F (CMD+F) in the Elements tab of DevTools to open the search bar where you can quickly search for elements using
> their selectors. And always make sure to use the DevTools to verify your scraping process and assumptions. It's faster than changing the crawler
> code all the time.

To get the title we just need to find it:

{{#code}}title.js{{/code}}
{{> note-title}}
