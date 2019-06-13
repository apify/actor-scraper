The [`page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) variable is provided by Puppeteer
and it represents the open browser page. The [`page.$()`](https://pptr.dev/#?product=Puppeteer&show=api-pageselector)
is similar to jQuery. You provide it with a selector and it returns a reference to an element.
Be careful though. Elements only exist in the browser and this is Node.js context. The element is not an
actual [`Element`](https://developer.mozilla.org/en-US/docs/Web/API/Element),
but an [`ElementHandle`](https://pptr.dev/#?product=Puppeteer&show=api-class-elementhandle). You can use
the `ElementHandle` to operate on the `Element` in the browser, but it's not the `Element` itself.
