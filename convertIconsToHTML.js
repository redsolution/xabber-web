let badges_names = [
        'blocked',
        'bot-variant',
        'bot',
        'channel',
        'group-incognito',
        'group-invite',
        'group-private',
        'group-public',
        'mobile',
        'rss-variant',
        'rss',
        'server'
    ],
    material_icons = [
        'palette',
        'pinned',
        'pinned-circle-small',
        'saved-messages',
        'translate',
        'circles',
        'crosshairs-gps',
        'crosshairs-question',
        'crosshairs',
        'map-marker-outline',
        'map-marker',
        'minus',
    ],
    circle_icons = [,
        'task'
    ],
    fs = require('fs');
badges_names.forEach((name) => {
    let svg = fs.readFileSync(`../xabber-icons/badge/icon/${name}.svg`, 'utf-8');
    fs.writeFileSync(`./templates/svg/${name}.html`, svg);
});
material_icons.forEach((name) => {
    let svg = fs.readFileSync(`../xabber-icons/icon/material/${name}.svg`, 'utf-8');
    fs.writeFileSync(`./templates/svg/${name}.html`, svg);
});
circle_icons.forEach((name) => {
    let svg = fs.readFileSync(`../xabber-icons/badge/circle/${name}.svg`, 'utf-8');
    fs.writeFileSync(`./templates/svg/${name}.html`, svg);
});