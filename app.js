const express = require('express');

const app = express();
app.use(express.json());


const firebase = require('firebase-admin');
const serviceAccount = require('./cert.json');

const Expo = require('expo-server-sdk');
const expo = new Expo.Expo();

firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccount),
    databaseURL: "https://scorecast-5f168.firebase.com/"
});

const db = firebase.firestore();


db.collection('games').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
        console.log(change);
        if (change.type === 'added') {
            const game = change.doc.data();
            // add reposts listener, write the listener below
            const admin = game.admin;
            db.collection('users').get()
                .then(snapshot => {
                    let users = {}
                    let notif_rec = [];
                    snapshot.docChanges().forEach(docChange => {
                        users[docChange.doc.id] = docChange.doc.data();
                    });
                    game.reposters.forEach(reposter_uid => {
                        const followers = users[reposter_uid].followed;
                        notif_rec = notif_rec.concat(followers);
                    });
                    notif_rec = notif_rec.concat(users[admin].followed);
                    // remove the dupes
                    const expoTokensWithDupes = notif_rec.map(uid => users[uid].expoDeviceToken);
                    const expoDevices = expoTokensWithDupes
                        .filter((item, index) => expoTokensWithDupes.findIndex(elem => elem === item) === index);
                    
                    const messages = [];
                    const admin_name = users[admin].username;

                    expoDevices.forEach(token => {
                        messages.push({
                            to: token,
                            sound: 'default',
                            body: `@${admin_name} has just started hosting ${game.variables.gameName}. Come check it out.`,
                            data: {
                                game
                            }
                        });
                    });

                    console.log(messages);

                    const chunks = expo.chunkPushNotifications(messages);
                    const tickets = [];
                    (async () => {
                        // Send the chunks to the Expo push notification service. There are
                        // different strategies you could use. A simple one is to send one chunk at a
                        // time, which nicely spreads the load out over time:
                        for (let chunk of chunks) {
                            try {
                                let ticketChunk = await expo.sendPushNotificationsAsync(
                                    chunk
                                );
                                console.log(ticketChunk);
                                tickets.push(
                                    ...ticketChunk
                                );
                                // NOTE: If a ticket contains an error code in ticket.details.error, you
                                // must handle it appropriately. The error codes are listed in the Expo
                                // documentation:
                                // https://docs.expo.io/versions/latest/guides/push-notifications#response-format
                            } catch (error) {
                                console.error(error);
                            }
                        }
                    })();

                    // Later, after the Expo push notification service has delivered the
                    // notifications to Apple or Google (usually quickly, but allow the the service
                    // up to 30 minutes when under load), a "receipt" for each notification is
                    // created. The receipts will be available for at least a day; stale receipts
                    // are deleted.
                    //
                    // The ID of each receipt is sent back in the response "ticket" for each
                    // notification. In summary, sending a notification produces a ticket, which
                    // contains a receipt ID you later use to get the receipt.
                    //
                    // The receipts may contain error codes to which you must respond. In
                    // particular, Apple or Google may block apps that continue to send
                    // notifications to devices that have blocked notifications or have uninstalled
                    // your app. Expo does not control this policy and sends back the feedback from
                    // Apple and Google so you can handle it appropriately.
                    let receiptIds = [];
                    for (let ticket of tickets) {
                        // NOTE: Not all tickets have IDs; for example, tickets for notifications
                        // that could not be enqueued will have error information and no receipt ID.
                        if (ticket.id) {
                            receiptIds.push(ticket.id);
                        }
                    }

                    let receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
                    (async () => {
                        // Like sending notifications, there are different strategies you could use
                        // to retrieve batches of receipts from the Expo service.
                        for (let chunk of receiptIdChunks) {
                            try {
                                let receipts = await expo.getPushNotificationReceiptsAsync(chunk);
                                console.log(receipts);

                                // The receipts specify whether Apple or Google successfully received the
                                // notification and information about an error, if one occurred.
                                for (let receipt of receipts) {
                                    if (receipt.status === 'ok') {
                                        continue;
                                    } else if (receipt.status === 'error') {
                                        console.error(`There was an error sending a notification: ${receipt.message}`);
                                        if (receipt.details && receipt.details.error) {
                                            // The error codes are listed in the Expo documentation:
                                            // https://docs.expo.io/versions/latest/guides/push-notifications#response-format
                                            // You must handle the errors appropriately.
                                            console.error(`The error code is ${receipt.details.error}`);
                                        }
                                    }
                                }
                            } catch (error) {
                                console.error(error);
                            }
                        }
                    })();
                })
        }
    })
});

const PORT = process.env.PORT || 12345;
app.listen(PORT, () => {
    console.log(`ScoreCast backend running on ${PORT}`)
});
