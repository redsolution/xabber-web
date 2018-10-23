var constants = {
    DEBUG: false,

    STORAGE_NAME: 'xabber-storage',
    STORAGE_VERSION: 'v8',

    FAVICON_DEFAULT: "images/favicon.png",
    FAVICON_MESSAGE: "images/favicon-message.png",

    WIDTH_MEDIUM:   1420,
    WIDTH_NARROW:   1280,
    WIDTH_TINY:     1152,

    LOG_LEVEL_NONE: -1,
    LOG_LEVEL_ERROR: 1,
    LOG_LEVEL_WARN: 2,
    LOG_LEVEL_INFO: 3,
    LOG_LEVEL_DEBUG: 4,

    LOG_LEVEL: 'ERROR',

    KEY_BACKSPACE: 8,
    KEY_TAB: 9,
    KEY_ENTER: 13,
    KEY_ESCAPE: 27,
    KEY_ARROW_LEFT: 37,
    KEY_ARROW_UP: 38,
    KEY_ARROW_RIGHT: 39,
    KEY_ARROW_DOWN: 40,
    KEY_DELETE: 46,
    KEY_FORWARD_SLASH: 47,

    VOICE_MSG_TIME: 120,

    PASSWORD_DOT: String.fromCharCode(0x2022),

    CONNECTION_URL: null,

    CONN_STATUSES: {
        0: 'ERROR',
        1: 'CONNECTING',
        2: 'CONNFAIL',
        3: 'AUTHENTICATING',
        4: 'AUTHFAIL',
        5: 'CONNECTED',
        6: 'DISCONNECTED',
        7: 'DISCONNECTING',
        8: 'ATTACHED',
        9: 'REDIRECT',
        10:'CONNTIMEOUT'
    },

    BAD_CONN_STATUSES: [0, 2, 4, 6, 10],

    RECONNECTION_TIMEOUTS: [3000, 10000, 15000],

    STATUSES: {
        chat:           'Ready for chat',
        online:         'Online',
        away:           'Away',
        xa:             'Away for long time',
        dnd:            'Busy',
        offline:        'Offline',
        unavailable:    'Unavailable'
    },

    STATUS_WEIGHTS: {
        chat:           1,
        online:         2,
        away:           3,
        xa:             4,
        dnd:            5,
        offline:        6,
        unavailable:    7
    },

    CHATSTATE_TIMEOUT_PAUSED:   5000,
    CHATSTATE_TIMEOUT_STOPPED:  5000,

    MSG_ERROR: -1,
    MSG_PENDING: 0,
    MSG_SENT: 1,
    MSG_DISPLAYED: 2,

    RSM_ATTRIBUTES: ['max', 'first', 'last', 'after', 'before', 'index', 'count'],
    MAM_ATTRIBUTES: ['with', 'start', 'end'],

    GENERAL_GROUP_ID: 1,
    NON_ROSTER_GROUP_ID: 2,

    ACCOUNT_COLORS: [
        "red", "green", "blue", "deep-purple", "orange", "lime",
        "pink", "purple", "indigo", "light-blue", "cyan", "teal",
        "light-green", "amber", "deep-orange", "brown", "blue-grey"
    ],

    MAX_AVATAR_FILE_SIZE: 20000000,

    AVATAR_SIZES: {
        TOOLBAR_ACCOUNT_ITEM:           32,
        SETTINGS_ACCOUNT_ITEM:          32,
        SYNCHRONIZE_ACCOUNT_ITEM:       36,
        XABBER_ACCOUNT:                 32,
        ACCOUNT_SETTINGS_LEFT:          96,
        ACCOUNT_VCARD_EDIT:             80,
        ROSTER_RIGHT_ACCOUNT_ITEM:      38,
        ROSTER_LEFT_ACCOUNT_ITEM:       40,
        CONTACT_RIGHT_ITEM:             32,
        CONTACT_LEFT_ITEM:              32,
        CONTACT_BLOCKED_ITEM:           32,
        CONTACT_DETAILS:                96,
        GROUP_SETTINGS:                 96,
        CHAT_ITEM:                      40,
        CHAT_HEAD:                      40,
        CHAT_MESSAGE:                   32,
        CHAT_BOTTOM:                    48
    },

    SOUNDS: {
        beep_up:            'sounds/beep_up.ogg',
        tiny_noize:         'sounds/tiny_noize.ogg',
        retro_game:         'sounds/retro_game.ogg',
        pixel_beep:         'sounds/pixel_beep.ogg',
        beep_positive:      'sounds/beep_positive.ogg',
        good_chime:         'sounds/good_chime.ogg',
        cellular_click:     'sounds/cellular_click.ogg',
        bleep:              'sounds/bleep.ogg',
        mono_u:             'sounds/mono_u.ogg',
        plop:               'sounds/plop.ogg',
        ether:              'sounds/ether.ogg',
        pop:                'sounds/pop.ogg',
        computer_chime:     'sounds/computer_chime.ogg',
        beep_a:             'sounds/beep_a.ogg'
    },

    SYNC_WAY_DATA: {
        no: {
            tip: 'Settings are already synchronized',
            icon: 'mdi-cloud-check'
        },
        from_server: {
            tip: 'Settings will be downloaded from the cloud',
            icon: 'mdi-cloud-download'
        },
        to_server: {
            tip: 'Local settings will be uploaded to cloud',
            icon: 'mdi-cloud-upload'
        },
        delete: {
            tip: 'Local account will be deleted',
            icon: 'mdi-delete'
        },
        off_local: {
            tip: 'Local account',
            icon: 'mdi-cloud-outline-off'
        },
        off_remote: {
            tip: 'Remote account',
            icon: 'mdi-cloud-outline-off'
        }
    },

    SYNCED_STATUS_DATA: {
        off: {
            tip: 'Synchronization disabled',
            icon: 'mdi-cloud-outline-off'
        },
        yes: {
            tip: 'Settings are synchronized',
            icon: 'mdi-cloud-check'
        },
        no: {
            tip: 'Settings are not synchronized with cloud',
            icon: 'mdi-cloud'
        }
    },

    XABBER_ACCOUNT_URL: 'https://www.xabber.com/account',
    API_SERVICE_URL: 'https://api.xabber.com/api/v2',
    USE_SOCIAL_AUTH: true,
    DEFAULT_LOGIN_SCREEN: 'xmpp',

    GCM_SENDER_ID: '868637702480',
    GCM_API_KEY: 'AIzaSyC1JCBB3LLf_4DG_vRWMEEe0I4X5msEU-M',
    MESSAGE_ARCHIVE_DB_NAME: 'MessageArchive'
};

constants.MSG_STATE = {};
constants.MSG_STATE[constants.MSG_ERROR] = 'error';
constants.MSG_STATE[constants.MSG_PENDING] = 'pending';
constants.MSG_STATE[constants.MSG_SENT] = 'sent';
constants.MSG_STATE[constants.MSG_DISPLAYED] = 'displayed';

constants.MSG_VERBOSE_STATE = {};
constants.MSG_VERBOSE_STATE[constants.MSG_ERROR] = 'Message error';
constants.MSG_VERBOSE_STATE[constants.MSG_PENDING] = 'Message not sent';
constants.MSG_VERBOSE_STATE[constants.MSG_SENT] = 'Message sent';
constants.MSG_VERBOSE_STATE[constants.MSG_DISPLAYED] = 'Message delivered to user';


if (typeof define === "function") {
    define(function () {
        return constants;
    });
}
