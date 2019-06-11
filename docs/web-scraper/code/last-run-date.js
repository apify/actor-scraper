const $wrapper = $('header div.wrap');
return {
    title: $wrapper.find('h1').text(),
    description: $wrapper.find('p').text(),
    lastRunDate: new Date(Number($wrapper.find('time').eq(1).attr('datetime'))),
};
