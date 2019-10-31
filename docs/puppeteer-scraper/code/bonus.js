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
                await page.waitFor(buttonSelector, { timeout }); // Default timeout first time.
                timeout = 2000; // 2 sec timeout after the first.
            } catch (err) {
                // Ignore the timeout error.
                log.info('Could not find the "Show more button", we\'ve reached the end.');
                break;
            }
            log.info('Clicking the "Show more" button.');
            await page.click(buttonSelector);
        }
    }

    async function handleDetail({ request, log, skipLinks, page }) {
        const { url } = request;
        log.info(`Scraping ${url}`);
        await skipLinks();

        // Do some scraping.
        const uniqueIdentifier = url.split('/').slice(-2).join('/');

        // Get attributes in parallel to speed up the process.
        const titleP = page.$eval('header h1', (el => el.textContent));
        const descriptionP = page.$eval('header p[class^=Text__Paragraph]', (el => el.textContent));
        const lastRunTimestampP = page.$$eval('time', (els) => els[1].getAttribute('datetime'));
        const runCountTextP = page.$eval('ul.stats li:nth-of-type(3)', (el => el.textContent));

        const [title, description, lastRunTimestamp, runCountText] = await Promise.all([titleP, descriptionP, lastRunTimestampP, runCountTextP]);

        const lastRunDate = new Date(Number(lastRunTimestamp));
        const runCount = Number(runCountText.match(/\d+/)[0]);

        return {
            url,
            uniqueIdentifier,
            title,
            description,
            lastRunDate,
            runCount,
        };
    }
}
