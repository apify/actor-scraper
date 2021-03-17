async function pageFunction(context) {
    const { request, log, skipLinks } = context;
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

        return {
            url,
            uniqueIdentifier,
        };
    }
}
