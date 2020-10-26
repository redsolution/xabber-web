let names = [
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
    fs = require('fs');
names.forEach((name) => {
    let svg = fs.readFileSync(`../xabber-icons/badge/icon/${name}.svg`, 'utf-8');
    fs.writeFileSync(`./templates/svg/${name}.html`, svg);
});