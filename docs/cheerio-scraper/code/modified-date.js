return {
    title: $('header h1').text(),
    description: $('header span.actor-description').text(),
    modifiedDate: new Date(
        Number(
            $('ul.ActorHeader-stats time').attr('datetime'),
        ),
    ),
};
