/**
 * pushNotificationService — native push token registration for server alerts.
 */

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications, type PushNotificationSchema } from "@capacitor/push-notifications";
import api from "./api";
import { isMobileNativePlatform } from "../utils/platform";

const PUSH_TOKEN_CACHE_KEY = "native_push_token_v1";
const ANDROID_FOREGROUND_CHANNEL_ID = "workflow-alerts";

let pushListenersAttached = false;
let pushReplayListenersAttached = false;
let androidChannelReady = false;

type CachedPushToken = {
  token: string;
  platform: string;
  updatedAt: number;
};

async function registerTokenWithServer(token: string, platform: string): Promise<void> {
  try {
    await api.post("/push-tokens", { token, platform });
  } catch (err) {
    console.warn("[push] failed to register token with server", err);
  }
}

function readCachedPushToken(): CachedPushToken | null {
  try {
    const raw = localStorage.getItem(PUSH_TOKEN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedPushToken>;
    if (!parsed.token || !parsed.platform) return null;
    return {
      token: parsed.token,
      platform: parsed.platform,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function cachePushToken(token: string, platform: string): void {
  try {
    localStorage.setItem(PUSH_TOKEN_CACHE_KEY, JSON.stringify({
      token,
      platform,
      updatedAt: Date.now(),
    } satisfies CachedPushToken));
  } catch {
    // Ignore storage failures; the token can still be replayed during this session.
  }
}

async function replayCachedTokenIfAvailable(): Promise<void> {
  const cached = readCachedPushToken();
  if (!cached) return;
  await registerTokenWithServer(cached.token, cached.platform);
}

async function ensureAndroidForegroundChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== "android" || androidChannelReady) return;

  try {
    await LocalNotifications.createChannel({
      id: ANDROID_FOREGROUND_CHANNEL_ID,
      name: "Workflow alerts",
      description: "Foreground workflow and assignment notifications",
      importance: 5,
      visibility: 1,
      sound: "default",
    });
    androidChannelReady = true;
  } catch (err) {
    console.warn("[push] failed to create Android foreground channel", err);
  }
}

async function mirrorForegroundNotificationOnAndroid(notification: PushNotificationSchema): Promise<void> {
  if (Capacitor.getPlatform() !== "android") return;

  const title = notification.title?.trim() || "Notification";
  const body = notification.body?.trim() || "";
  if (!title && !body) return;

  await ensureAndroidForegroundChannel();

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 2147483000,
          title,
          body,
          channelId: ANDROID_FOREGROUND_CHANNEL_ID,
          schedule: { at: new Date(Date.now() + 50) },
          extra: notification.data,
        },
      ],
    });
  } catch (err) {
    console.warn("[push] failed to mirror foreground notification on Android", err);
  }
}

function attachPushReplayListeners(): void {
  if (pushReplayListenersAttached) return;
  pushReplayListenersAttached = true;

  const replay = () => {
    void replayCachedTokenIfAvailable();
  };

  window.addEventListener("auth-change", replay);
  window.addEventListener("auth-user-updated", replay);
  window.addEventListener("app-foregrounded", replay);
}

function attachPushListeners(): void {
  if (pushListenersAttached) return;
  pushListenersAttached = true;

  void PushNotifications.addListener("registration", (result) => {
    const platform = Capacitor.getPlatform();
    cachePushToken(result.value, platform);
    void registerTokenWithServer(result.value, platform);
  });

  void PushNotifications.addListener("registrationError", (err) => {
    console.warn("[push] registration failed", err);
  });

  void PushNotifications.addListener("pushNotificationReceived", (notification) => {
    void mirrorForegroundNotificationOnAndroid(notification);
    window.dispatchEvent(new Event("notifications:refresh"));
  });

  void PushNotifications.addListener("pushNotificationActionPerformed", () => {
    window.dispatchEvent(new Event("notifications:refresh"));
  });
}

/** Request permissions and register for remote push (native only). Safe to call repeatedly. */
export async function registerPushNotificationsIfNeeded(): Promise<void> {
  if (!isMobileNativePlatform()) return;

  attachPushListeners();
  attachPushReplayListeners();
  await ensureAndroidForegroundChannel();

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return;

  await PushNotifications.register();
  await replayCachedTokenIfAvailable();
}
