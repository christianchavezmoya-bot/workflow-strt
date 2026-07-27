/**
 * biometricAuth — Face ID / Touch ID gate for the app.
 *
 * On native (iOS / Android): wraps capacitor-native-biometric.
 * On web: always returns "available: false" so the gate is skipped.
 */

import { secureGet, secureSet } from "./secureStorage";
import { isMobileNativePlatform } from "../utils/platform";
import { isAuthTokenExpired } from "../utils/authToken";

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
  | "pin-needed";      // biometric unavailable, show PIN gate

/**
 * Check if biometric is available on the device.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!isMobileNativePlatform()) return false;
  if (import.meta.env.VITE_SKIP_BIOMETRIC === "true") return false;
  try {
    const { NativeBiometric } = await import("capacitor-native-biometric");
    const { isAvailable } = await NativeBiometric.isAvailable();
    return isAvailable;
  } catch {
    return false;
  }
}

/**
 * Check if PIN is set up (fallback for when biometric unavailable).
 */
export function isPinSet(): boolean {
  return !!secureGet("app_pin_hash");
}

/**
 * Set a PIN for offline unlock fallback.
 * PIN should be 4-6 digits. Stores as hash for security.
 */
export async function setPin(pin: string): Promise<void> {
  // Simple hash for demo - in production use bcrypt or similar
  const hash = await hashPin(pin);
  await secureSet("app_pin_hash", hash);
}

/**
 * Verify a PIN against stored hash.
 */
export async function verifyPin(pin: string): Promise<boolean> {
  const storedHash = secureGet("app_pin_hash");
  if (!storedHash) return false;
  const hash = await hashPin(pin);
  return hash === storedHash;
}

/**
 * Simple PIN hashing (for demo purposes).
 * In production, use a proper crypto library.
 */
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "kinet_pin_salt_2024");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Decide what the app should do on launch.
 * Call this after initSecureStorage() resolves.
 * Now async to check biometric availability.
 */
export async function getLaunchAuthModeAsync(): Promise<BiometricCheckResult> {
  if (!isMobileNativePlatform()) return "not-native";
  if (import.meta.env.VITE_SKIP_BIOMETRIC === "true") return "not-native";

  const token = secureGet("auth_token");
  if (!token) return "no-session";

  if (!isOfflineGraceValid()) return "grace-expired";

  // JWT expired while online → full re-login, not Face ID unlock.
  // Only skip login when the device is DEFINITELY offline — iOS often reports
  // disconnected briefly on cold start, which wrongly sent users to Face ID
  // with an expired token instead of Login.
  if (isAuthTokenExpired(token)) {
    try {
      const { Network } = await import("@capacitor/network");
      const status = await Network.getStatus();
      if (status.connected !== false) return "no-session";
    } catch {
      return "no-session";
    }
  }

  // Check if biometric is available
  const biometricAvailable = await isBiometricAvailable();
  if (biometricAvailable) return "biometric-needed";

  // Fall back to PIN if set up
  if (isPinSet()) return "pin-needed";

  // No biometric and no PIN - require online login
  return "no-session";
}

/**
 * Synchronous version for backward compatibility.
 * Assumes biometric is available on native platforms.
 */
export function getLaunchAuthMode(): BiometricCheckResult {
  if (!isMobileNativePlatform()) return "not-native";
  if (import.meta.env.VITE_SKIP_BIOMETRIC === "true") return "not-native";

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
