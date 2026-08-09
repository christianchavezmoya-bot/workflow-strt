/**
 * pushNotificationService — native push token registration + local reminders.
 *
 * Push keeps users aware of server-side alerts; local notifications nudge them
 * to reopen the app when uploads were paused in background.
 */

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import api from "./api";
import { isMobileNativePlatform } from "../utils/platform";

const PENDING_UPLOAD_REMINDER_ID = 9001;
const PENDING_UPLOAD_REMINDER_DELAY_MS = 30_000;

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

  const localPerm = await LocalNotifications.checkPermissions();
  if (localPerm.display !== "granted") {
    await LocalNotifications.requestPermissions();
  }

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return;

  await PushNotifications.register();
}

export async function schedulePendingUploadLocalReminder(pendingCount: number): Promise<void> {
  if (!isMobileNativePlatform() || pendingCount <= 0) return;

  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") return;

  const label = pendingCount === 1 ? "1 change" : `${pendingCount} changes`;
  await LocalNotifications.schedule({
    notifications: [{
      id: PENDING_UPLOAD_REMINDER_ID,
      title: "Uploads paused",
      body: `${label} waiting to sync. Open the app to continue uploading.`,
      schedule: { at: new Date(Date.now() + PENDING_UPLOAD_REMINDER_DELAY_MS) },
    }],
  });
}

export async function cancelPendingUploadLocalReminder(): Promise<void> {
  if (!isMobileNativePlatform()) return;
  await LocalNotifications.cancel({ notifications: [{ id: PENDING_UPLOAD_REMINDER_ID }] });
}
