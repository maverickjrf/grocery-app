// Web Push — an EXPERIMENT, to learn whether a PWA can receive server-sent
// notifications on Android before using it in another project.
//
// How it fits together:
//   1. The page subscribes through the browser's PushManager, using our VAPID
//      public key. The browser returns a subscription: a push-service URL
//      (FCM on Chrome/Android) plus encryption keys for this one device.
//   2. Whoever wants to notify the phone (here: a Node script on the laptop;
//      in a real project: the backend) encrypts a message for those keys,
//      signs the request with the VAPID private key, and POSTs it to that URL.
//   3. The push service wakes sw.js, whose 'push' handler shows the
//      notification — the app does not need to be open.
//
// This app has no server, so the subscription is only shown for copying.
// Nothing here touches IndexedDB.

// Public half of the VAPID key pair. Safe to publish; the private half lives
// only with the sender and must never be committed.
const VAPID_PUBLIC_KEY = 'BFnjJXMcfngeHlTk9dvrTHpmzk90x1lAU0K_qxRqnT-VUSnWAkOuq0EUdbzDuqtyu-u8rg0rsAdDBf8U72amqYA';

export function pushSupported() {
  return window.isSecureContext && 'serviceWorker' in navigator
    && 'PushManager' in window && 'Notification' in window;
}

export const permission = () => Notification.permission; // 'default' | 'granted' | 'denied'

async function registration() {
  // ready never rejects; it waits until the worker is active.
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  return (await registration()).pushManager.getSubscription();
}

export async function enablePush() {
  const result = await Notification.requestPermission();
  if (result !== 'granted') {
    throw new Error(result === 'denied'
      ? 'Notifications are blocked. Allow them in the browser\'s site settings, then try again.'
      : 'Notification permission was not granted.');
  }
  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  try {
    return await reg.pushManager.subscribe({
      userVisibleOnly: true, // Chrome requires a visible notification for every push
      applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
    });
  } catch (err) {
    throw new Error(`Could not subscribe to push (${err.name || 'error'}).`);
  }
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) await sub.unsubscribe();
}

// A notification shown by the worker directly, no push involved. Separates
// "can this phone show our notifications?" from "does push reach it?".
export async function showLocalTest() {
  const reg = await registration();
  await reg.showNotification('Local test', {
    body: 'Notifications from this app display on this device.',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: 'local-test',
  });
}

function base64UrlToBytes(s) {
  const b64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
