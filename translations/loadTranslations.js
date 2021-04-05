let fs = require('fs'),
    xmldom = require('xmldom'),
    json = {},
    http = require('https'),
    unzip = require('unzip'),
    DOMParser = new xmldom.DOMParser,
    args = process.argv.slice(2),
    token = args[0],
    _pending_finished,
    translation_progress = {en: 100};

function loadTranslationsProgress () {
    return new Promise((resolve, reject) => {
        http.get({protocol: "https:", host: "crowdin.com", path: "/api/v2/projects/110652/languages/progress?limit=200", headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"}}, (res) => {
            let rawData = "";
            res.setEncoding('utf8');
            res.on('data', (body) => {
                rawData += body;
            });
            res.on('end', () => {
                let json = JSON.parse(rawData);
                json.data.forEach((lang) => {
                    translation_progress[lang.data.languageId] = lang.data.translationProgress;
                });
                resolve();
            });
        });
    });
}

function downloadStrings () {
    return new Promise((resolve, reject) => {
        http.get({
            protocol: "https:",
            host: "crowdin.com",
            path: "/api/v2/projects/110652/files",
            headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"}
        }, (res) => {
            let rawData = "";
            res.setEncoding('utf8');
            res.on('data', (body) => {
                rawData += body;
            });
            res.on('end', () => {
                let json = JSON.parse(rawData),
                    files_count = json.data.length;
                json.data.forEach((lang) => {
                    downloadFile(lang.data.id, lang.data.path).then(() => {
                        !--files_count && resolve();
                    });
                });
            });
        });
    });
}

function downloadFile (file_id, file_name) {
    return new Promise((resolve, reject) => {
        http.get({
            protocol: "https:",
            host: "crowdin.com",
            path: `/api/v2/projects/110652/files/${file_id}/download`,
            headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"}
        }, (res) => {
            let rawData = "";
            res.setEncoding('utf8');
            res.on('data', (body) => {
                rawData += body;
            });
            res.on('end', () => {
                http.get(JSON.parse(rawData).data.url, (response) => {
                    let rawData = "";
                    response.setEncoding('utf8');
                    response.on('data', (body) => {
                        rawData += body;
                    });
                    response.on('end', () => {
                        let path = file_name.slice(0, file_name.lastIndexOf("/"));
                        if (!fs.existsSync(`.${path}`))
                            require('child_process').execSync(`mkdir -p -m 755 ".${path}"`);
                        fs.writeFileSync(`.${file_name}`, rawData, {encoding: 'utf8'});
                        resolve();
                    });
                });
            });
        });
    });
}

function parseChildren (elem) {
    let childrens = elem.childNodes, str = "";
    for (let i = 0; i < childrens.length; i++) {
        let flag = 0;
        if (childrens[i].nodeName && (childrens[i].nodeName == 'b' || childrens[i].nodeName == 'i' || childrens[i].nodeName == 'u')) {
            str += `<${childrens[i].nodeName}>`;
            flag = 1;
        }
        if (childrens[i].childNodes && childrens[i].childNodes.length) {
            str += parseChildren(childrens[i]);
        } else if (childrens[i].nodeValue) {
            str += childrens[i].nodeValue;
        }
        flag && (str += `</${childrens[i].nodeName}>`);
    }
    return str;
}

function convertStringsToJSON () {
    fs.readdirSync('./values').forEach(file => {
        let xml = fs.readFileSync(`./values/${file}`, 'utf-8'),
            document = DOMParser.parseFromString(xml),
            strings = document.getElementsByTagName('string'),
            plurals = document.getElementsByTagName('plurals');
        for (let i = 0; i < strings.length; i++) {
            let id = strings[i].getAttribute('name');
            json[id] = parseChildren(strings[i]);
        }

        for (let i = 0; i < plurals.length; i++) {
            let id =  plurals[i].getAttribute('name'),
                items = plurals[i].getElementsByTagName('item');
            for (let j = 0; j < items.length; j++) {
                json[`${id}_plural_${j}`] = parseChildren(items[j]);
            }
        }
    });
}

function convertTranslationsToJSON () {
    let all_languages = fs.readdirSync('./languages').filter(file => file.indexOf('values-') == 0);
    all_languages.forEach((f_name) =>{
        let translations = {};
        fs.readdirSync(`./languages/${f_name}`).forEach(file => {
            let xml = fs.readFileSync(`./languages/${f_name}/${file}`, 'utf-8'),
                document = DOMParser.parseFromString(xml),
                strings = document.getElementsByTagName('string'),
                plurals = document.getElementsByTagName('plurals');
            for (let i = 0; i < strings.length; i++) {
                let id = strings[i].getAttribute('name');
                translations[id] = parseChildren(strings[i]);
            }

            for (let i = 0; i < plurals.length; i++) {
                let id =  plurals[i].getAttribute('name'),
                    items = plurals[i].getElementsByTagName('item');
                for (let j = 0; j < items.length; j++) {
                    translations[`${id}_plural_${j}`] = parseChildren(items[j]);
                }
            }
        });
        fs.writeFileSync(`${f_name.slice(7)}.js`, `typeof define === "function" && define(() => { return ${JSON.stringify(translations)};});`);
    });
}

function getTranslationsURL () {
    console.log('Build translations.....');
    return new Promise((resolve, reject) => {
        let request = http.request({method: 'POST', protocol: "https:", hostname: "crowdin.com", path: "/api/v2/projects/110652/translations/builds", headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"}}, (res) => {
            let rawData = "";
            res.setEncoding('utf8');
            res.on('data', (body) => {
                rawData += body;
            });
            res.on('end', () => {
                let buildId = JSON.parse(rawData).data.id;
                checkBuildProgress(buildId).then(() => {
                    http.get({protocol: "https:", host: "crowdin.com", path: `/api/v2/projects/110652/translations/builds/${buildId}/download`, headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"}}, (res) => {
                        let rawData = "";
                        res.setEncoding('utf8');
                        res.on('data', (body) => {
                            rawData += body;
                        });
                        res.on('end', () => {
                            let url = JSON.parse(rawData).data.url;
                            resolve(url);
                        });
                    });
                });
            });
        });
        request.end();
    });
}

function checkBuildProgress (buildId) {
    return new Promise((resolve, reject) => {
        _pending_finished = setInterval(() => {
            http.get({protocol: "https:", host: "crowdin.com", path: `/api/v2/projects/110652/translations/builds/${buildId}`, headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"}}, (res) => {
                let rawData = "";
                res.setEncoding('utf8');
                res.on('data', (body) => {
                    rawData += body;
                });
                res.on('end', () => {
                    let progress = JSON.parse(rawData).data.progress;
                    if (progress == 100) {
                        clearInterval(_pending_finished);
                        resolve();
                    }
                });
            });
        }, 3000);
    });
}

function downloadArchive (url) {
    return new Promise((resolve, reject) => {
        http.get(url, (response) => {
            let pipe = response.pipe(unzip.Extract({path:'./languages'}));
            pipe.on('finish', () => {
                resolve();
            });
        });
    });
}

getTranslationsURL().then((url) => {
    return downloadArchive(url);
}).then(() => {
    console.log('Translations loaded.....');
    console.log('Converting translations.....');
    convertTranslationsToJSON();
    console.log('***Translations written successfully***');
});

loadTranslationsProgress().then(() => {
    return downloadStrings();
}).then(() => {
    console.log('Strings loaded.....');
    console.log('Converting strings.....');
    convertStringsToJSON();
    console.log('***Strings written successfully***');

    fs.writeFileSync(`translation_progress.js`, `let client_translation_progress = ${JSON.stringify(translation_progress)}; typeof define === "function" && define(() => { return client_translation_progress;});`);
    fs.writeFileSync(`en.js`, `typeof define === "function" && define(() => { return ${JSON.stringify(json)};});`);
});