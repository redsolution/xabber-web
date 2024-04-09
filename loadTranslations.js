//todo: change pathings
let fs = require('fs'),
    http = require('https'),
    unzip = require('unzipper'),
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
                        if (!fs.existsSync(`./translations${path}`))
                            require('child_process').execSync(`mkdir -p -m 755 "./translations${path}"`);
                        fs.writeFileSync(`./translations${file_name}`, rawData, {encoding: 'utf8'});
                        resolve();
                    });
                });
            });
        });
    });
}

function getTranslationsURL () {
    console.log('Download translations.....');
    return new Promise((resolve, reject) => {
        let request = http.request({method: 'POST', protocol: "https:", hostname: "crowdin.com", path: "/api/v2/projects/110652/translations/builds", headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"}}, (res) => {
            let rawData = "";
            res.setEncoding('utf8');
            res.on('data', (body) => {
                rawData += body;
            });
            res.on('end', () => {
                try{
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
                } catch (e) {
                    console.log(e);
                    console.log(rawData);
                }
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
            let pipe = response.pipe(unzip.Extract({path:'./translations/languages'}));
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
});

loadTranslationsProgress().then(() => {
    return downloadStrings();
}).then(() => {
    console.log('Strings loaded.....');
    fs.writeFileSync(`translations/translation_progress.js`, `let client_translation_progress = ${JSON.stringify(translation_progress)}; typeof define === "function" && define(() => { return client_translation_progress;});`);
});