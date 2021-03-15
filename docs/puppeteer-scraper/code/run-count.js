const title = await page.$eval(
    'header h1',
    (el => el.textContent)
);
const description = await page.$eval(
    'header span.actor-description',
    (el => el.textContent)
);

const modifiedTimestamp = await page.$$eval(
    'time',
    (els) => els[1].getAttribute('datetime')
);
const modifiedDate = new Date(Number(modifiedTimestamp));

const runCountText = await page.$eval(
    'ul.ActorHeader-stats > li:nth-of-type(3)',
    (el => el.textContent)
);
const runCount = Number(runCountText.match(/[\d,]+/)[0].replace(',', ''));

return {
    title,
    description,
    modifiedDate,
    runCount,
};
