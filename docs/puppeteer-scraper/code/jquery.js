async function pageFunction(context) {
    switch (context.request.userData.label) {
        case 'START': return handleStart(context);
        case 'DETAIL': return handleDetail(context);
    }

    async function handleStart({ log, page }) {
        log.info('Store opened!');
        let timeout; // undefined
        const buttonSelector = 'div.show-more > button';
        while (true) {
            log.info('Waiting for the "Show more" button.');
            try {
                await page.waitFor(buttonSelector, { timeout });
                timeout = 2000;
            } catch (err) {
                log.info('Could not find the "Show more button", we\'ve reached the end.');
                break;
            }
            log.info('Clicking the "Show more" button.');
            await page.click(buttonSelector);
        }
    }

    async function handleDetail({ request, log, skipLinks, page, Apify }) { // <-------- Destructure Apify.
        await Apify.utils.puppeteer.injectJQuery(page); // <-------- Inject jQuery.

        const { url } = request;
        log.info(`Scraping ${url}`);
        await skipLinks();

        // Do some scraping.
        const uniqueIdentifier = url.split('/').slice(-2).join('/');

        const results = await page.evaluate(() => { // <-------- Use jQuery only inside page.evaluate (inside browser).
            const $wrapper = $('header div.wrap');
            return {
                title: $wrapper.find('h1').text(),
                description: $wrapper.find('p').text(),
                lastRunDate: new Date(Number($wrapper.find('time').eq(1).attr('datetime'))),
                runCount: Number($wrapper.find('div.stats > span:nth-of-type(3)').text().match(/\d+/)[0]),
            };
        })

        return {
            url,
            uniqueIdentifier,
            ...results, // <-------- Add results from browser to output.
        };
    }
}
