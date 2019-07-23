Similarly to `page.$eval`, the [`page.$$eval`](https://pptr.dev/#?product=Puppeteer&show=api-elementhandleevalselector-pagefunction-args)
function runs a function in the browser, only this time, it does not provide
you with a single `Element` as the function's argument, but rather with an `Array` of `Elements`. Once again,
the return value of the function will be passed back to the Node.js context.
