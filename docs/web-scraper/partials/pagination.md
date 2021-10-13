#### The `context.waitFor()` function

`waitFor()` is a function that's available on the `context` object passed to the `pageFunction` and helps you with,
well, waiting for stuff. It accepts either a number of milliseconds to wait, a selector to await in the page,
or a function to execute. It will stop waiting once the time elapses, the selector appears or the provided function
returns `true`.

```js
// Waits for 2 seconds.
await waitFor(2000);
// Waits until an element with id "my-id" appears
// in the page.
await waitFor('#my-id');
// Waits until a "myObject" variable appears
// on the window object.
await waitFor(() => !!window.myObject);
```

The selector may never be found and the function might never return `true`, so the `waitFor()` function also has
a timeout. The default is `20` seconds. You can override it by providing an options object as the second parameter,
with a `timeoutMillis` property.

```js
await waitFor('.bad-class', { timeoutMillis: 5000 });
```

With those tools, you should be able to handle any dynamic content the website throws at you.

### [](#how-to-paginate) How to paginate

With the theory out of the way, this should be pretty easy. The algorithm is a loop:

1. Wait for the **Show more** button.
2. Click it.
3. Is there another **Show more** button?
    - Yes? Repeat the above. (loop)
    - No? We're done. We have all the actors.

#### Waiting for the button

Before we can wait for the button, we need to know its unique selector. A quick look in the DevTools tells us
that the button's class is some weird randomly generated string, but fortunately, there's an enclosing `<div>`
with a class of `show-more`. Great! Our unique selector:

```text
div.show-more > button
```

> Don't forget to confirm our assumption in the DevTools finder tool (CTRL/CMD + F).

![Finding show more button in DevTools](../img/waiting-for-the-button.webp)

Now that we know what to wait for, we just plug it into the `waitFor()` function.

```js
await waitFor('div.show-more > button');
```

#### Clicking the button

We have a unique selector for the button and we know that it's already rendered in the page. Clicking it is a piece of cake. We'll use jQuery again, but feel free to use plain JavaScript, it works the same.

```js
$('div.show-more > button').click()
```

This will show the next page of actors.

#### Repeating the process

We've shown two function calls, but how do we make this work together in the `pageFunction`?

```js
async function pageFunction(context) {

// ...

let timeoutMillis; // undefined
const buttonSelector = 'div.show-more > button';
while (true) {
    log.info('Waiting for the "Show more" button.');
    try {
        // Default timeout first time.
        await waitFor(buttonSelector, { timeoutMillis });
        // 2 sec timeout after the first.
        timeoutMillis = 2000;
    } catch (err) {
        // Ignore the timeout error.
        log.info('Could not find the "Show more button", '
            + 'we\'ve reached the end.');
        break;
    }
    log.info('Clicking the "Show more" button.');
    $(buttonSelector).click();
}

// ...

}
```

We want to run this until the `waitFor()` function throws, so that's why we use a `while(true)` loop. We're also not
interested in the error, because we're expecting it, so we just ignore it and print a log message instead.

You might be wondering what's up with the `timeoutMillis`. Well, for the first page load, we want to wait longer,
so that all the page's JavaScript has had a chance to execute, but for the other iterations, the JavaScript is
already loaded and we're just waiting for the page to re-render so waiting for `2` seconds is enough to confirm
that the button is not there. We don't want to stall the scraper for `20` seconds just to make sure that there's
no button.

### [](#plugging-it-into-the-page-function) Plugging it into the pageFunction

We've got the general algorithm ready, so all that's left is to integrate it into our earlier `pageFunction`.
Remember the `// Do some stuff later` comment? Let's replace it. And don't forget to destructure the `waitFor()`
function on the first line.

{{#code}}pagination.js{{/code}}

That's it! You can now remove the **Max pages per run** limit, **Save & Run** your task and watch the scraper paginate
through all the actors and then scrape all of their data. After it succeeds, open the **Dataset** tab again click on **Preview**. You should have a table of all the actor's details in front of you. If you do, great job!
You've successfully scraped Apify Store. And if not, no worries, just go through the code examples again,
it's probably just some typo.

![Final results](../img/plugging-it-into-the-pagefunction.webp)
