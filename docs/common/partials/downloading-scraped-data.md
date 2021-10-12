## [](#downloading-our-scraped-data) Downloading the scraped data

You already know the **Dataset** tab of the run console since this is where we've always previewed our data. Notice the row of data formats such as JSON, CSV, and Excel. Below it are options for viewing and downloading the data. Go ahead and try it.

> If you prefer working with an API, you can find the example endpoint under the API tab: **Get dataset items**.

### [](#items-and-clean-items) Items and Clean items

There are two types of data available for download: standard and clean. The standard form will always include a record
for each `pageFunction` invocation, even if you did not return any results. The record also includes hidden fields
such as `#debug`, where you can find a variety of information that can help you with debugging your scrapers.

Clean items, on the other hand, include only the data you returned from the `pageFunction`. If you're only interested in the data you scraped, this format is what you will be using most of the time.
