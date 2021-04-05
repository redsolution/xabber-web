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
        'saved-messages',
        'translate',
        'circles'
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