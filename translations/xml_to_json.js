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
            items = plurals[i].getElementsByTagName('item'), str = "";
        for (let j = 0; j < items.length; j++) {
            json[`${id}_plural_${j}`] = parseChildren(items[j].replace(/%+\d+[$]/g, "%"));
        }
    }
});

fs.writeFileSync(`en_lang.js`, `let translations = ${JSON.stringify(json)}; typeof define === "function" && define(() => { return translations;});`);