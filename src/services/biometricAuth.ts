/**
 * biometricAuth — Face ID / Touch ID gate for the app.
 *
 * On native (iOS / Android): wraps capacitor-native-biometric.
 * On web: always returns "available: false" so the gate is skipped.
 */

import { Capacitor } from "@capacitor/core";
import { secureGet, secureSet } from "./secureStorage";

// How long (ms) a session can be used offline before requiring a full re-login
export const OFFLINE_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Call after every successful online login to record the timestamp. */
export async function recordOnlineLogin(): Promise<void> {
  await secureSet("last_online_login", Date.now().toString());
}

/** True if the offline grace period has NOT yet expired. */
export function isOfflineGraceValid(): boolean {
  const ts = secureGet("last_online_login");
  if (!ts) return false;
  return Date.now() - parseInt(ts, 10) < OFFLINE_GRACE_MS;
}

export type BiometricCheckResult =
  | "not-native"       // running in browser — skip gate
  | "no-session"       // no token in keychain — show Login
  | "grace-expired"    // >30 days offline — force re-login
  | "biometric-needed" // session valid, show Face ID gate
  | "unavailable";     // no biometric hardware — fall back to PIN (future)

/**
 * Decide what the app should do on launch.
 * Call this after initSecureStorage() resolves.
 */
export function getLaunchAuthMode(): BiometricCheckResult {
  if (!Capacitor.isNativePlatform()) return "not-native";

  const token = secureGet("auth_token");
  if (!token) return "no-session";

  if (!isOfflineGraceValid()) return "grace-expired";

  return "biometric-needed";
}

/** Prompt Face ID / Touch ID. Resolves on success, throws on failure/cancel. */
export async function promptBiometric(reason: string = "Unlock to continue"): Promise<void> {
  const { NativeBiometric } = await import("capacitor-native-biometric");

  const { isAvailable, biometryType } = await NativeBiometric.isAvailable();
  if (!isAvailable) {
    throw new Error(`Biometric not available (type: ${biometryType})`);
  }

  await NativeBiometric.verifyIdentity({
    reason,
    title: "Unlock App",
    subtitle: "Use Face ID or fingerprint to open",
    negativeButtonText: "Cancel",
  });
}
