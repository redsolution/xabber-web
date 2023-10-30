let sounds_dirs = [
        'attention',
        'dialtones',
        'interface',
        'notifications',
        'ringtones',
    ],
    fs = require('fs');
sounds_dirs.forEach((name) => {
    fs.cp(`../xabber-sounds/${name}`, `./sounds/${name}`, {recursive: true}, (err) =>{
        console.log(err);
    });
});