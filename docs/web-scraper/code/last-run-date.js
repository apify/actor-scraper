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
};
