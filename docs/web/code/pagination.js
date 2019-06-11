async function pageFunction(context) {
    const { request, log, skipLinks, jQuery: $, waitFor } = context;
    if (request.userData.label === 'START') {
        log.info('Store opened!');
        let timeoutMillis; // undefined
        const buttonSelector = 'div.show-more > button';
        while (true) {
            log.info('Waiting for the "Show more" button.');
            try {
                await waitFor(buttonSelector, { timeoutMillis }); // Default timeout first time.
                timeoutMillis = 2000; // 2 sec timeout after the first.
            } catch (err) {
                // Ignore the timeout error.
                log.info('Could not find the "Show more button", we\'ve reached the end.');
                break;
            }
            log.info('Clicking the "Show more" button.');
            $(buttonSelector).click();
        }

    }
    if (request.userData.label === 'DETAIL') {
        const { url } = request;
        log.info(`Scraping ${url}`);
        await skipLinks();

        // Do some scraping.
        const uniqueIdentifier = url.split('/').slice(-2).join('/');
        const $wrapper = $('header div.wrap');

        return {
            url,
            uniqueIdentifier,
            title: $wrapper.find('h1').text(),
            description: $wrapper.find('p').text(),
            lastRunDate: new Date(Number($wrapper.find('time').eq(1).attr('datetime'))),
            runCount: Number($wrapper.find('div.stats > span:nth-of-type(3)').text().match(/\d+/)[0]),
        };
    }
}
