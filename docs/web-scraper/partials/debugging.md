## [](#debugging) Debugging

Web scraping can be tricky, so it's common to run into issues while coding your scraper. To help you solve these issues, we've enlisted the mighty [Chrome DevTools](https://developers.google.com/web/tools/chrome-devtools) as part of our debugging toolkit. It allows you to monitor every step your scraper makes, all from the comfort of the **Live view** tab.

> The debugger is optimized to work with Google Chrome. It will still work with Firefox but for best results, we suggest using Chrome.

To enable the debugger, set your actor's **Run mode** to DEVELOPMENT under the **Input and options** tab. DEVELOPMENT mode restricts the actor's concurrency to 1 and increases timeouts to help you debug more easily. When you're done, make sure to set the **Run mode** back to PRODUCTION.

![Setting the actor's Run mode](../img/debugging-run-mode.webp)

Now, debugging wouldn't be debugging without [breakpoints](https://developers.google.com/web/tools/chrome-devtools/javascript/breakpoints). Use the [`debugger`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/debugger) command in your [`pageFunction`](https://docs.apify.com/tutorials/apify-scrapers/getting-started#the-page-function) wherever you need to set one.

```javascript
async function pageFunction(context) {
    const { request,
        log,
        skipLinks,
        jQuery: $,
        waitFor
    } = context;

    if (request.userData.label === 'START') {
        log.info('Store opened!');
        let timeoutMillis; // undefined

        debugger;

        const buttonSelector = 'div.show-more > button';
        while (true) {
                // ...
            }
            log.info('Clicking the "Show more" button.');

            debugger;

            $(buttonSelector).click();
        }
    }
    // ...
}
```

Additionally, use the **Advanced configuration** menu to set breakpoints outside the `pageFunction`. These allow you to start the debugger either before navigation to the URL, before invoking the `pageFunction`, and after the invocation.

Once you've set your input and breakpoints, click the **Save & Run** button to try the debugger for yourself. To let you know you're in development mode, the **Log** will display the following banner.

![The log shows a banner to tell you you're in development mode](../img/debugging-log.webp)

Over in the **Live view** tab, the actor should have hit its first breakpoint. It will start on the **Sources** tab, which lets you control your breakpoints, look through the page's file tree, your `pageFunction`, and view useful information such as the page's **Scope**. The Scope includes the page's `context`and `request`. If you've already spent time debugging actors, you'll know - this will save you a lot of `console.log`s.

Thinking of which, the **Console** tab allows you to execute statements in the context of your `pageFunction`. This means even fewer `console.log`s when checking if your values are of the right type and less tab-hopping when looking for that special [selector](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors).

Take some time to play around with all the available options. If you're unfamiliar with debuggers and their controls, make sure to [read this article](https://developers.google.com/web/tools/chrome-devtools/javascript/reference#stepping) about stepping through your code.

When you're finished with the debugging, don't forget to set your actor's **Run mode** to PRODUCTION.
