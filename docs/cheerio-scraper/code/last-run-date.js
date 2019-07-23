return {
    title: $('h1').text(),
    description: $('main header p[class^=Text__Paragraph]').text(),
    lastRunDate: new Date(
        Number(
            $('time')
                .eq(1)
                .attr('datetime'),
        ),
    ),
};
