const $wrapper = $('header div.wrap');
return {
    title: $wrapper.find('h1').text(),
    description: $wrapper.find('p').text(),
    lastRunDate: new Date(Number($wrapper.find('time').eq(1).attr('datetime'))),
    runCount: Number($wrapper.find('div.stats > span:nth-of-type(3)').text().match(/\d+/)[0]),
};
