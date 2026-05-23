/**
 * VAPID 키 생성: node scripts/generate-vapid-keys.js
 * 출력된 값을 .env 의 VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY 에 넣으세요.
 */
const webpush = require("web-push");
const keys = webpush.generateVAPIDKeys();
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
console.log("VAPID_SUBJECT=mailto:you@example.com");
