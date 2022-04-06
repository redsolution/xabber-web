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
        'account-outline',
        'birthday-outline',
        'status-outline',
        'job-outline',
        'address-outline',
        'email-outline',
        'description-outline',
        'call-outline',
        'call',
        'search',
        'bell',
        'bell-off',
        'bell-sleep',
        'cancel',
        'edit',
        'edit-outline',
        'blocked-add',
        'information-outline',
        'qrcode',
        'fullname',
        'fullname-outline',
        'id-outline',
        'clock-outline',
        'index',
        'restrictions-outline',
        'history',
        'camera-retake',
        'chevron-down',
        'membership-outline',
        'invite-outline',
        'chevron-right-variant',
        'chevron-left-variant',
        'subscription-to',
        'subscription-from',
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