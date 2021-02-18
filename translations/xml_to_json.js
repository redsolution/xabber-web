let fs = require('fs'),
    xmldom = require('xmldom'),
    json = {},
    DOMParser = new xmldom.DOMParser;
fs.readdirSync('./values').forEach(file => {
    let xml = fs.readFileSync(`./values/${file}`, 'utf-8');
    let document = DOMParser.parseFromString(xml),
        strings = document.getElementsByTagName('string');
    for (let i = 0; i < strings.length; i++) {
       let id = strings[i].attributes['0'].value,
           text_node = strings[i].attributes['0'],
           text = text_node.ownerElement.firstChild ? text_node.ownerElement.firstChild.nodeValue : "";
        json[id] = text;
    }
});