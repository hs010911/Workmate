/**
 * @fileoverview PWA Web Push 구독
 */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function enableProjectPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    showModal("알림", "이 브라우저는 푸시 알림을 지원하지 않습니다.");
    return;
  }

  const token = sessionStorage.getItem("token");
  if (!token) {
    showModal("알림", "로그인 후 이용해주세요.");
    return;
  }

  try {
    const keyRes = await fetch(`${window.apiBase}/api/push/vapid-public-key`);
    const keyData = await keyRes.json();
    if (!keyData.configured || !keyData.publicKey) {
      showModal(
        "알림",
        "서버에 VAPID 키가 설정되지 않았습니다. (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)",
      );
      return;
    }

    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      showModal("알림", "알림 권한이 거부되었습니다.");
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      });
    }

    await apiPost("/api/push/subscribe", { subscription: sub.toJSON() });
    showModal("알림", "푸시 알림이 등록되었습니다. GitHub 푸시·병합 시 알림을 받을 수 있습니다.");

    const btn = document.getElementById("enablePushBtn");
    if (btn) btn.textContent = "푸시 알림 등록됨";
  } catch (error) {
    showError("푸시 등록 실패", error);
  }
}
