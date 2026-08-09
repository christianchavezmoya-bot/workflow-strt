/**
 * pushNotificationService — native push token registration for server alerts.
 */

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import api from "./api";
import { isMobileNativePlatform } from "../utils/platform";

let pushListenersAttached = false;

async function registerTokenWithServer(token: string, platform: string): Promise<void> {
  try {
    await api.post("/push-tokens", { token, platform });
  } catch (err) {
    console.warn("[push] failed to register token with server", err);
  }
}

function attachPushListeners(): void {
  if (pushListenersAttached) return;
  pushListenersAttached = true;

  void PushNotifications.addListener("registration", (result) => {
    void registerTokenWithServer(result.value, Capacitor.getPlatform());
  });

  void PushNotifications.addListener("registrationError", (err) => {
    console.warn("[push] registration failed", err);
  });

  void PushNotifications.addListener("pushNotificationReceived", () => {
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

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return;

  await PushNotifications.register();
}
