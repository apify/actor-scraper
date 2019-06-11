const $wrapper = await page.$('header div.wrap');
const title = await $wrapper.$eval('h1', (el => el.textContent));

return {
    title,
}
