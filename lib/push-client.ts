"use client";

import { removePushDevice, savePushDevice } from "@/app/actions/notifications";

/** What this device can do with push (R27). */
export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** False when the server has no VAPID key: then push is not offered at all. */
export const pushConfigured = Boolean(PUBLIC_KEY);

function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js");
}

/** Registers the service worker on page load, so it is ready before push is switched on. */
export function registerServiceWorker() {
  if (!pushConfigured || !("serviceWorker" in navigator)) return;
  registration().catch((e) => console.error("[push] Service Worker nicht registriert:", e));
}

/** The current state, registering the service worker when push is possible. */
export async function readPushState(): Promise<PushState> {
  // On iPhone, push exists only for apps added to the home screen (iOS 16.4+).
  if (isIos() && !isInstalled()) return "ios-install";
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = await (await registration()).pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Asks for permission, subscribes this device and saves it. Returns the new state. */
export async function turnPushOn(): Promise<{ state: PushState; error?: string }> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { state: permission === "denied" ? "denied" : "off" };
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(PUBLIC_KEY!),
    }));
  const json = sub.toJSON();
  const result = await savePushDevice({
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
  });
  if (result.error) {
    await sub.unsubscribe();
    return { state: "off", error: result.error };
  }
  return { state: "on" };
}

/** Unsubscribes this device and removes it on the server. Safe to call when push is off. */
export async function turnPushOff(): Promise<void> {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await removePushDevice(sub.endpoint);
  await sub.unsubscribe();
}
