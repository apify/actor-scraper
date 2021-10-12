### [](#modified-date) Modified date

The DevTools tell us that the `modifiedDate` can be found in a `<time>` element.

![Finding actor modified date in DevTools](../img/modified-date.webp)

{{#code}}modified-date.js{{/code}}
{{> note-modified-date}}

It might look a little too complex at first glance, but let us walk you through it. We find all the `<time>` elements. Then, we read its `datetime` attribute, because that's where a unix timestamp is stored as a `string`.

But we would much rather see a readable date in our results, not a unix timestamp, so we need to convert it. Unfortunately the `new Date()`
constructor will not accept a `string`, so we cast the `string` to a `number` using the `Number()` function before actually calling `new Date()`.
Phew!
