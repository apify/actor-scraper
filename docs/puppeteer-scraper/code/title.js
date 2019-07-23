// Using Puppeteer
const title = await page.$eval('h1', (el => el.textContent));

return {
    title,
}
