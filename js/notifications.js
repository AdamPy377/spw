// --- Break push notifications --------------------------------------------
function breakNotificationsSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
function breakNotificationPermission() {
    if (!breakNotificationsSupported()) return "unsupported";
    return Notification.permission;
}
function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
async function currentPushSubscription() {
    if (!breakNotificationsSupported()) return null;
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
}
async function breakNotificationStatus() {
    if (!breakNotificationsSupported()) return { supported: false, enabled: false, permission: "unsupported" };
    const subscription = await currentPushSubscription().catch(() => null);
    return { supported: true, enabled: !!subscription && Notification.permission === "granted", permission: Notification.permission };
}
async function enableBreakNotifications() {
    if (!breakNotificationsSupported()) {
        toast("This browser does not support push notifications");
        return;
    }
    if (!window.isSecureContext) {
        toast("Break notifications require HTTPS. Open SPW over HTTPS, then enable them again.");
        return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
        toast("Notification permission was not granted");
        renderBreakDashboard();
        return;
    }
    try {
        const registration = await navigator.serviceWorker.ready;
        const key = await api("/api/push/public-key");
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(key.public_key),
            });
        }
        await api("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(subscription.toJSON()),
        });
        toast("Break notifications enabled · 5 minutes before each break");
    } catch (error) {
        toast(error.message || "Could not enable break notifications");
    }
    renderBreakDashboard();
}
async function disableBreakNotifications() {
    try {
        const subscription = await currentPushSubscription();
        if (subscription) {
            await api("/api/push/subscribe", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endpoint: subscription.endpoint }),
            }).catch(() => {});
            await subscription.unsubscribe();
        }
        toast("Break notifications disabled");
    } catch (error) {
        toast(error.message || "Could not disable break notifications");
    }
    renderBreakDashboard();
}
function breakNotificationCard() {
    if (!breakNotificationsSupported()) {
        return `<div class="card"><h2>Break notifications</h2><div class="small muted">This browser does not support push notifications.</div></div>`;
    }
    const permission = breakNotificationPermission();
    const secure = window.isSecureContext;
    return `<div class="card" id="break-notification-card"><div class="row"><div style="flex:1"><h2>Break notifications</h2><div class="small muted">Optional device notification 5 minutes before every scheduled meal or rest break.</div><div id="break-notification-status" class="small muted" style="margin-top:5px">Checking notification status…</div></div><button class="btn ${permission === "granted" ? "" : "primary"}" onclick="enableBreakNotifications()" ${secure ? "" : "disabled"}>Enable</button><button class="btn sm" onclick="disableBreakNotifications()">Disable</button></div>${secure ? "" : '<div class="offline-note" style="margin-top:9px">Push notifications require HTTPS. The rest of SPW can continue to work normally over HTTP.</div>'}</div>`;
}
async function refreshBreakNotificationStatus() {
    const el = $("break-notification-status");
    if (!el) return;
    const status = await breakNotificationStatus().catch(() => ({ supported: true, enabled: false, permission: Notification.permission }));
    if (status.enabled) el.textContent = "Enabled on this device · alerts are sent 5 minutes before each break.";
    else if (status.permission === "denied") el.textContent = "Blocked in browser/device notification settings.";
    else el.textContent = "Not enabled on this device.";
}
