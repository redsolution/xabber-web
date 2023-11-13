//todo: change pathings
let fs = require('fs'),
    xmldom = require('xmldom'),
    json = {},
    DOMParser = new xmldom.DOMParser;

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
    fs.readdirSync('./translations/values').forEach(file => {
        let xml = fs.readFileSync(`./translations/values/${file}`, 'utf-8'),
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
    let all_languages = fs.readdirSync('./translations/languages').filter(file => file.indexOf('values-') == 0);
    all_languages.forEach((f_name) =>{
        let translations = {};
        fs.readdirSync(`./translations/languages/${f_name}`).forEach(file => {
            let xml = fs.readFileSync(`./translations/languages/${f_name}/${file}`, 'utf-8'),
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
        fs.writeFileSync(`translations/${f_name.slice(7)}.js`, `typeof define === "function" && define(() => { return ${JSON.stringify(translations)};});`);
    });
}

convertTranslationsToJSON();
console.log('Translations converted.....');
convertStringsToJSON();
console.log('Strings converted.....');
fs.rmSync('./translations/languages', { recursive: true, force: true });
fs.rmSync('./translations/values', { recursive: true, force: true });
console.log('Temporary directories were removed.....');

fs.writeFileSync(`translations/en.js`, `typeof define === "function" && define(() => { return ${JSON.stringify(json)};});`);