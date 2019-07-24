const title = await page.$eval('header h1', (el => el.textContent));
const description = await page.$eval('header p[class^=Text__Paragraph]', (el => el.textContent));

const lastRunTimestamp = await page.$$eval('time', (els) => els[1].getAttribute('datetime'));
const lastRunDate = new Date(Number(lastRunTimestamp));

return {
    title,
    description,
    lastRunDate,
};
