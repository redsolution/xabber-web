importScripts('https://www.gstatic.com/firebasejs/4.3.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/4.3.1/firebase-messaging.js');

const msg_sender_id = '868637702480';

firebase.initializeApp({
    'messagingSenderId': msg_sender_id
});

const messaging = firebase.messaging();

messaging.setBackgroundMessageHandler(function (message) {
    self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    }).then(function (clients) {
        clients.forEach(function (client) {
            client.postMessage({
                "firebase-messaging-msg-type": "push-msg-received",
                "firebase-messaging-msg-data": message
            });
        })
    });

    if (message.from === msg_sender_id) {
        var title, body,
            icon = 'images/xabber-logo-48.png';

        var payload;
        try {
            payload = JSON.parse(atob(message.data.body));
        } catch (e) {
            payload = message.data
        }
        if (payload.action === 'settings_updated') {
            title = 'Settings updated';
            body = 'for user ' + payload.username;

            return self.registration.showNotification(title, {
                body: body,
                icon: icon
            });
        }
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
});
