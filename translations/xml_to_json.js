let fs = require('fs'),
    xmldom = require('xmldom'),
    json = {},
    http = require('https');
    DOMParser = new xmldom.DOMParser;
let args = process.argv.slice(2),
    token = args[0],
    translation_progress = {};
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
    });
});
/*http.get({protocol: "https:", host: "crowdin.com", path: "/api/v2/projects/110652/languages/progress?limit=200", headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"}}, (res) => {
});*/

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
    fs.writeFileSync(`${f_name.slice(7)}.js`, `let translations = ${JSON.stringify(translations)}; typeof define === "function" && define(() => { return translations;});`);
});


fs.writeFileSync(`translation_progress.js`, `let client_translation_progress = ${JSON.stringify(translation_progress)}; typeof define === "function" && define(() => { return client_translation_progress;});`);
fs.writeFileSync(`en_lang.js`, `let default_translation = ${JSON.stringify(json)}; typeof define === "function" && define(() => { return default_translation;});`);