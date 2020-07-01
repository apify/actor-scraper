// Using Puppeteer
const title = await page.$eval(
    'header h1',
    (el => el.textContent)
);

return {
    title,
}
