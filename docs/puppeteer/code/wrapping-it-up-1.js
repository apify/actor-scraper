const { url } = request;

// ...

const uniqueIdentifier = url.split('/').slice(-2).join('/');
const $wrapper = await page.$('header div.wrap');

const title = await $wrapper.$eval('h1', (el => el.textContent));
const description = await $wrapper.$eval('p', (el => el.textContent));

const lastRunTimestamp = await $wrapper.$$eval('time', (els) => els[1].getAttribute('datetime'));
const lastRunDate = new Date(Number(lastRunTimestamp));

const runCountText = await $wrapper.$eval('div.stats > span:nth-of-type(3)', (el => el.textContent));
const runCount = Number(runCountText.match(/\d+/)[0]);

return {
    url,
    uniqueIdentifier,
    title,
    description,
    lastRunDate,
    runCount,
};
