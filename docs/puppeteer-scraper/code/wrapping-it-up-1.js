const { url } = request;

// ...

const uniqueIdentifier = url
    .split('/')
    .slice(-2)
    .join('/');

const title = await page.$eval(
    'header h1',
    (el => el.textContent)
);
const description = await page.$eval(
    'header span.actor-description',
    (el => el.textContent)
);

const modifiedTimestamp = await page.$eval(
    'ul.ActorHeader-stats time',
    (el) => el.getAttribute('datetime')
);
const modifiedDate = new Date(Number(modifiedTimestamp));

const runCountText = await page.$eval(
    'ul.ActorHeader-stats > li:nth-of-type(3)',
    (el => el.textContent)
);
const runCount = Number(runCountText.match(/[\d,]+/)[0].replace(',', ''));

return {
    url,
    uniqueIdentifier,
    title,
    description,
    modifiedDate,
    runCount,
};
