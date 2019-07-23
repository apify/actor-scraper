### Last run date
The DevTools tell us that the `lastRunDate` can be found in the second of the two `<time>` elements in the page.

![actor last run date selector](../img/last-run-date.jpg "Finding actor last run date in DevTools.")

{{#code}}last-run-date.js{{/code}}
{{> note-last-run-date}}

It might look a little too complex at first glance, but let me walk you through it. We find all the `<time>` elements. There are two, so we grab the
second one using the `.eq(1)` call (it's zero indexed) and then we read its `datetime` attribute, because that's where a unix timestamp is stored as a
`string`.

But we would much rather see a readable date in our results, not a unix timestamp, so we need to convert it. Unfortunately the `new Date()`
constructor will not accept a `string`, so we cast the `string` to a `number` using the `Number()` function before actually calling `new Date()`.
Phew!
