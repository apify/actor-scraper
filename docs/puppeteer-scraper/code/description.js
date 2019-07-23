const title = await page.$eval('h1', (el => el.textContent));
const description = await page.$eval('main header p[class^=Text__Paragraph]', (el => el.textContent));

return {
    title,
    description
};
