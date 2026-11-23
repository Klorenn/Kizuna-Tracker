/** Browser-side helpers for web push. Client only. */

import { SW_READY_TIMEOUT_MS, withTimeout } from "@/lib/push-status";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function toKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Asks permission (must run inside a user gesture), subscribes and stores the subscription. */
export async function enablePush(): Promise<"granted" | "denied" | "unavailable" | "error"> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unavailable";
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    // `ready` never settles when no worker controls the page (dev, blocked SW): give up after 4 s
    const reg = await withTimeout(navigator.serviceWorker.ready, SW_READY_TIMEOUT_MS);
    if (reg === "timeout") return "unavailable";
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    return res.ok ? "granted" : "error";
  } catch {
    return "error";
  }
}

/**
 * Sign-out hygiene: unsubscribe this device (so it stops notifying the account that is leaving),
 * delete its server row while the session is still valid, and drop runtime caches. Best effort.
 */
export async function cleanupOnSignOut(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      reg?.active?.postMessage({ type: "CLEAR_CACHES" });
    }
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !n.includes("precache")).map((n) => caches.delete(n)));
    }
  } catch {
    // never block the sign-out
  }
}
