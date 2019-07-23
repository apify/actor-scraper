The [`page.$eval`](https://pptr.dev/#?product=Puppeteer&show=api-elementhandleevalselector-pagefunction-args-1)
function allows you to run a function in the browser, with the selected element as the first argument.
Here we use it to extract the text content of a `h1` element that's in the page. The return value of the function
is automatically passed back to the Node.js context, so we receive an actual `string` with the element's text.
