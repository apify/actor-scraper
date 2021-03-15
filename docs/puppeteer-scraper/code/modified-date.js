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

return {
    title,
    description,
    modifiedDate,
};
