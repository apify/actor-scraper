const $wrapper = await page.$('header div.wrap');

const title = await $wrapper.$eval('h1', (el => el.textContent));
const description = await $wrapper.$eval('p', (el => el.textContent));

const lastRunTimestamp = await $wrapper.$$eval('time', (els) => els[1].getAttribute('datetime'));
const lastRunDate = new Date(Number(lastRunTimestamp));

return {
    title,
    description,
    lastRunDate,
};
