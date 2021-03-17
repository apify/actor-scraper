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
                log.info('Could not find the "Show more button", '
                    + 'we\'ve reached the end.');
                break;
            }
            log.info('Clicking the "Show more" button.');
            await page.click(buttonSelector);
        }
    }

    async function handleDetail(context) {
        const {
            request,
            log,
            skipLinks,
            page,
            Apify,
        } = context;

        // Inject jQuery
        await Apify.utils.puppeteer.injectJQuery(page);

        const { url } = request;
        log.info(`Scraping ${url}`);
        await skipLinks();

        // Do some scraping.
        const uniqueIdentifier = url
            .split('/')
            .slice(-2)
            .join('/');

        // Use jQuery only inside page.evaluate (inside browser)
        const results = await page.evaluate(() => {
            return {
                title: $('header h1').text(),
                description: $('header span.actor-description').text(),
                modifiedDate: new Date(
                    Number(
                        $('ul.ActorHeader-stats time').attr('datetime'),
                    ),
                ).toISOString(),
                runCount: Number(
                    $('ul.ActorHeader-stats > li:nth-of-type(3)')
                        .text()
                        .match(/[\d,]+/)[0]
                        .replace(/,/g, ''),
                ),
            };
        });

        return {
            url,
            uniqueIdentifier,
            // Add results from browser to output
            ...results,
        };
    }
}
