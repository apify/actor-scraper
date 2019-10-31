### Description
Getting the actor's description is a little more involved, but still pretty straightforward. We can't just simply search for a `<p>` tag, because
there's a lot of them in the page. We need to narrow our search down a little. Using the DevTools we find that the actor description is nested within
the `<header>` element too, same as the title. Sadly, we're still left with two `<p>` tags. To finally select only the
description, we choose the `<p>` tag that has a `class` that starts with `Text__Paragraph`.

![actor description selector](../img/description.jpg "Finding actor description in DevTools.")

{{#code}}description.js{{/code}}
