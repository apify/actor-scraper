const $wrapper = await page.$('header div.wrap');
const title = await $wrapper.$eval('h1', (el => el.textContent));
const description = await $wrapper.$eval('p', (el => el.textContent));

return {
    title,
    description
};
