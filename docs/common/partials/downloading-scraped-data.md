## Downloading the scraped data
You already know the DATASET tab of the run console since this is where we've always previewed our data.
Notice that at the bottom, there is a table with multiple data formats, such as JSON, CSV or an Excel sheet,
and to the right, there are options to download the scraping results in any of those formats. Go ahead and try it.

> If you prefer working with an API, you can find an example in the API tab of the run console: **Get dataset items**.

### Items and Clean items
There are two types of data available for download. Items and Clean items. The Items will always include a record
for each `pageFunction` invocation, even if you did not return any results. The record also includes hidden fields
such as `#debug`, where you can find various information that can help you with debugging your scrapers.

Clean items, on the other hand, include only the data you returned from the `pageFunction`. If you're only interested
in the data you scraped, this format is what you will be using most of the time.
