const { url } = request;

// ...

const uniqueIdentifier = url.split('/').slice(-2).join('/');

const title = await page.$eval('header h1', (el => el.textContent));
const description = await page.$eval('header p[class^=Text__Paragraph]', (el => el.textContent));

const lastRunTimestamp = await page.$$eval('time', (els) => els[1].getAttribute('datetime'));
const lastRunDate = new Date(Number(lastRunTimestamp));

const runCountText = await page.$eval('ul.stats li:nth-of-type(3)', (el => el.textContent));
const runCount = Number(runCountText.match(/\d+/)[0]);

return {
    url,
    uniqueIdentifier,
    title,
    description,
    lastRunDate,
    runCount,
};
