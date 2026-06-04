/** @fileoverview Web Push (PWA) — GitHub 알림 등 */
let webpush;
try {
  webpush = require("web-push");
} catch {
  webpush = null;
}

function isPushConfigured() {
  return (
    !!webpush &&
    !!process.env.VAPID_PUBLIC_KEY &&
    !!process.env.VAPID_PRIVATE_KEY
  );
}

function configureVapid() {
  if (!webpush || !isPushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@workgather.local",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  return true;
}

async function sendPushToUser(userDoc, payload) {
  if (!configureVapid() || !userDoc?.pushSubscriptions?.length) return;

  const dead = [];
  for (const sub of userDoc.pushSubscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        },
        JSON.stringify(payload),
      );
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) dead.push(sub.endpoint);
    }
  }

  if (dead.length) {
    userDoc.pushSubscriptions = userDoc.pushSubscriptions.filter(
      (s) => !dead.includes(s.endpoint),
    );
    userDoc.markModified("pushSubscriptions");
    await userDoc.save();
  }
}

module.exports = { isPushConfigured, configureVapid, sendPushToUser };
