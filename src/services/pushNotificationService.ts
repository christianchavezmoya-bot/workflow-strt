/**
 * pushNotificationService — native push token registration for server alerts.
 */

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications, type PushNotificationSchema } from "@capacitor/push-notifications";
import api from "./api";
import { isMobileNativePlatform } from "../utils/platform";
import { waitForFirstLoginQuiet } from "../utils/postLoginQuietWindow";

const PUSH_TOKEN_CACHE_KEY = "native_push_token_v1";
const ANDROID_FOREGROUND_CHANNEL_ID = "workflow-alerts";
const TOKEN_REGISTER_MAX_ATTEMPTS = 3;
const TOKEN_REGISTER_RETRY_MS = 2_000;
/** Skip duplicate server POSTs for the same token within this window. */
const TOKEN_REGISTER_COOLDOWN_MS = 5 * 60_000;
/** Collapse bursty replay events (api-server-reachable fires on every axios success). */
const TOKEN_REPLAY_DEBOUNCE_MS = 3_000;

let pushListenersAttached = false;
let pushReplayListenersAttached = false;
let androidChannelReady = false;
let pushAuthListenersAttached = false;
let registrationInFlight: Promise<void> | null = null;
let serverRegisterInFlight: Promise<void> | null = null;
let replayDebounceTimer: number | undefined;
let lastServerRegister: { token: string; platform: string; at: number } | null = null;

type CachedPushToken = {
  token: string;
  platform: string;
  updatedAt: number;
};

function shouldSkipServerRegister(token: string, platform: string): boolean {
  if (!lastServerRegister) return false;
  if (lastServerRegister.token !== token || lastServerRegister.platform !== platform) return false;
  return Date.now() - lastServerRegister.at < TOKEN_REGISTER_COOLDOWN_MS;
}

async function registerTokenWithServer(token: string, platform: string): Promise<void> {
  if (shouldSkipServerRegister(token, platform)) return;

  if (serverRegisterInFlight) {
    await serverRegisterInFlight;
    if (shouldSkipServerRegister(token, platform)) return;
  }

  serverRegisterInFlight = (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < TOKEN_REGISTER_MAX_ATTEMPTS; attempt++) {
      try {
        await api.post("/push-tokens", { token, platform }, { timeout: 30_000 });
        lastServerRegister = { token, platform, at: Date.now() };
        return;
      } catch (err) {
        lastErr = err;
        if (attempt === TOKEN_REGISTER_MAX_ATTEMPTS - 1) break;
        await new Promise((resolve) => window.setTimeout(resolve, TOKEN_REGISTER_RETRY_MS * (attempt + 1)));
      }
    }
    console.warn("[push] failed to register token with server after retries", lastErr);
  })();

  try {
    await serverRegisterInFlight;
  } finally {
    serverRegisterInFlight = null;
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

function scheduleReplayCachedToken(): void {
  if (replayDebounceTimer !== undefined) {
    window.clearTimeout(replayDebounceTimer);
  }
  replayDebounceTimer = window.setTimeout(() => {
    replayDebounceTimer = undefined;
    void replayCachedTokenIfAvailable();
  }, TOKEN_REPLAY_DEBOUNCE_MS);
}

function attachPushReplayListeners(): void {
  if (pushReplayListenersAttached) return;
  pushReplayListenersAttached = true;

  // Do NOT listen to api-server-reachable — it fires on every successful axios
  // response and caused dozens of concurrent POST /push-tokens (false offline on Wi‑Fi).
  window.addEventListener("auth-change", scheduleReplayCachedToken);
  window.addEventListener("auth-user-updated", scheduleReplayCachedToken);
  window.addEventListener("app-foregrounded", scheduleReplayCachedToken);
  window.addEventListener("offline-mode-online", scheduleReplayCachedToken);
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

  if (registrationInFlight) {
    await registrationInFlight;
    return;
  }

  registrationInFlight = (async () => {
    await waitForFirstLoginQuiet();
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
  })();

  try {
    await registrationInFlight;
  } finally {
    registrationInFlight = null;
  }
}

/** Call after login so push registration runs once auth token is available. */
export function attachPushRegistrationOnAuth(): void {
  if (!isMobileNativePlatform() || pushAuthListenersAttached) return;
  pushAuthListenersAttached = true;

  const onAuth = () => {
    void registerPushNotificationsIfNeeded();
  };

  window.addEventListener("auth-change", onAuth);
  window.addEventListener("auth-user-updated", onAuth);
}
