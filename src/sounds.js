
    let sounds = {};

    let attention_json = require('~/sounds/attention/attention.json'),
        attention = [];


    Object.keys(attention_json).forEach(item => {
        let audio = require(`~/sounds/attention/${item}/${item}.mp3`),
            attention_sound = {
                file_name: item,
                name: attention_json[item].name,
                audio: audio,
                not_selectable: attention_json[item].not_selectable,
        };
        attention.push(attention_sound);
    });

    let ringtones_json = require('~/sounds/ringtones/ringtones.json'),
        ringtones = [];


    Object.keys(ringtones_json).forEach(item => {
        let audio = require(`~/sounds/ringtones/${item}/${item}.mp3`),
            ringtone = {
                file_name: item,
                name: ringtones_json[item].name,
                audio: audio,
                not_selectable: ringtones_json[item].not_selectable,
        };
        ringtones.push(ringtone);
    });

    let dialtones_json = require('~/sounds/dialtones/dialtones.json'),
        dialtones = [];


    Object.keys(dialtones_json).forEach(item => {
        let audio = require(`~/sounds/dialtones/${item}/${item}.mp3`),
            dialtone = {
                file_name: item,
                name: dialtones_json[item].name,
                audio: audio,
                not_selectable: dialtones_json[item].not_selectable,
        };
        dialtones.push(dialtone);
    });

    let notifications_json = require('~/sounds/notifications/notifications.json'),
        notifications = [];


    Object.keys(notifications_json).forEach(item => {
        let audio = require(`~/sounds/notifications/${item}/${item}.mp3`),
            notification = {
                file_name: item,
                name: notifications_json[item].name,
                audio: audio,
                not_selectable: notifications_json[item].not_selectable,
        };
        notifications.push(notification);
    });

    let system_json = require('~/sounds/system/system.json'),
        system_sound_list = [];


    Object.keys(system_json).forEach(item => {
        let audio = require(`~/sounds/system/${item}/${item}.mp3`),
            system_item = {
                file_name: item,
                name: system_json[item].name,
                audio: audio,
                not_selectable: system_json[item].not_selectable,
        };
        system_sound_list.push(system_item);
    });

    sounds.attention = attention;
    sounds.ringtones = ringtones;
    sounds.dialtones = dialtones;
    sounds.notifications = notifications;
    sounds.system = system_sound_list;
    sounds.all_sounds = attention.concat(ringtones).concat(dialtones).concat(notifications).concat(system_sound_list);

    export default sounds;