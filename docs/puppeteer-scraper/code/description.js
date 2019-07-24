const title = await page.$eval('header h1', (el => el.textContent));
const description = await page.$eval('header p[class^=Text__Paragraph]', (el => el.textContent));

return {
    title,
    description
};
