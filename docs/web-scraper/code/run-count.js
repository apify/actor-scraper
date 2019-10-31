return {
    title: $('header h1').text(),
    description: $('header p[class^=Text__Paragraph]').text(),
    lastRunDate: new Date(
        Number(
            $('time')
                .eq(1)
                .attr('datetime'),
        ),
    ),
    runCount: Number(
        $('ul.stats li:nth-of-type(3)')
            .text()
            .match(/\d+/)[0],
    ),
};
