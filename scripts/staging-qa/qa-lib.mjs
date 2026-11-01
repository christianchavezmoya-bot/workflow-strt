// Shared helpers for the staging QA account / test-project scripts (see README.md).
// Safety rails live here so every script gets them:
//   - only the staging API (or a local dev API with --local) is ever contacted; production is refused
//   - credentials come from env vars or the macOS Keychain, are never printed, logged or written
//   - every write is dry-run unless --apply is passed
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const STAGING_API = "https://api.staging.strata-ngo.com/api";
export const LOCAL_API = "http://localhost:4000/api";
const FORBIDDEN_HOSTS = ["api.strata-ngo.com", "www.strata-ngo.com", "strata-ngo.com"];

/** Names of everything these scripts create start with this, and cleanup refuses anything else. */
export const QA_PREFIX = "ZZQA";

// Refusals and API errors print one clear line (no stack trace) and exit non-zero.
for (const evt of ["uncaughtException", "unhandledRejection"]) {
  process.on(evt, (err) => { process.stderr.write(`[staging-qa] ERROR: ${err?.message ?? err}\n`); process.exit(1); });
}

export const args = new Set(process.argv.slice(2));
export const APPLY = args.has("--apply");
export function argValue(name) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

export function apiBase() {
  const base = args.has("--local") ? LOCAL_API : STAGING_API;
  const host = new URL(base).host;
  if (FORBIDDEN_HOSTS.includes(host)) throw new Error(`Refusing to run against production host ${host}`);
  if (base !== STAGING_API && base !== LOCAL_API) throw new Error(`API base ${base} is not on the allowlist`);
  return base;
}

/** State lives outside the repo so IDs (and nothing secret) survive between seed and cleanup. */
export function statePath() {
  const dir = path.join(os.homedir(), ".strata-ngo-qa");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return path.join(dir, args.has("--local") ? "state-local.json" : "state-staging.json");
}
export function readState() {
  try { return JSON.parse(fs.readFileSync(statePath(), "utf8")); } catch { return null; }
}
export function writeState(state) {
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), { mode: 0o600 });
}

/**
 * A secret from env var `envName`, else the macOS Keychain item `keychainService` (account
 * `keychainAccount`). Returned to the caller only; never echoed.
 */
export function secret(envName, keychainService, keychainAccount) {
  if (process.env[envName]) return process.env[envName];
  if (process.platform === "darwin") {
    try {
      return execFileSync("security", ["find-generic-password", "-s", keychainService, "-a", keychainAccount, "-w"], {
        encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch { /* not in keychain */ }
  }
  throw new Error(`Missing credential: set ${envName} or add Keychain item service="${keychainService}" account="${keychainAccount}"`);
}

export function log(msg) { process.stdout.write(`[staging-qa] ${msg}\n`); }

/** fetch wrapper: JSON in/out, bearer token, and error messages that never include request bodies. */
export async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${apiBase()}${route}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** Password login only: 2FA-enabled accounts are refused (see README §Security). */
export async function login(email, password) {
  const r = await api("POST", "/auth/login", { body: { email, password } });
  if (r?.requires2fa) throw new Error("Account has 2FA enabled: these scripts use a non-2FA staging QA account (see README §Security)");
  if (!r?.token) throw new Error("Login returned no token (first-login/password-expired accounts must finish setup in the browser first)");
  return { token: r.token, user: r.user };
}

export function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
}
