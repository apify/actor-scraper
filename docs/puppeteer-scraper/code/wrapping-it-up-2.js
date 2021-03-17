async function pageFunction(context) {
    // page is Puppeteer's page
    const { request, log, skipLinks, page } = context;

    if (request.userData.label === 'START') {
        log.info('Store opened!');
        // Do some stuff later.
    }
    if (request.userData.label === 'DETAIL') {
        const { url } = request;
        log.info(`Scraping ${url}`);
        await skipLinks();

        // Do some scraping.
        const uniqueIdentifier = url
            .split('/')
            .slice(-2)
            .join('/');

        // Get attributes in parallel to speed up the process.
        const titleP = page.$eval(
            'header h1',
            (el) => el.textContent,
        );
        const descriptionP = page.$eval(
            'header span.actor-description',
            (el) => el.textContent,
        );
        const modifiedTimestampP = page.$eval(
            'ul.ActorHeader-stats time',
            (el) => el.getAttribute('datetime'),
        );
        const runCountTextP = page.$eval(
            'ul.ActorHeader-stats > li:nth-of-type(3)',
            (el) => el.textContent,
        );

        const [
            title,
            description,
            modifiedTimestamp,
            runCountText,
        ] = await Promise.all([
            titleP,
            descriptionP,
            modifiedTimestampP,
            runCountTextP,
        ]);

        const modifiedDate = new Date(Number(modifiedTimestamp));
        const runCount = Number(runCountText.match(/[\d,]+/)[0].replace(',', ''));

        return {
            url,
            uniqueIdentifier,
            title,
            description,
            modifiedDate,
            runCount,
        };
    }
}
