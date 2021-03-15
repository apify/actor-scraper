### [](#description) Description

Getting the actor's description is a little more involved, but still pretty straightforward. We can't just simply search for a `<p>` tag, because
there's a lot of them in the page. We need to narrow our search down a little. Using the DevTools we find that the actor description is nested within
the `<header>` element too, same as the title. Moreover, the actual description is nested inside a `<span>` tag with a class `actor-description`.

![actor description selector](../img/description.jpg "Finding actor description in DevTools.")

{{#code}}description.js{{/code}}
