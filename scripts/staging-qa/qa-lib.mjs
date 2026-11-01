// Shared helpers for the staging QA account / test-project scripts (see README.md).
// Safety rails live here so every script gets them:
//   - only the staging API (or a local dev API with --local) can be contacted; anything else,
//     production included, is refused before a request is made
//   - credentials come from env vars or the macOS Keychain and are never printed, logged or written
//   - API errors never carry response bodies (they can echo submitted credentials or tokens)
//   - every write is dry-run unless --apply is passed
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const STAGING_API = "https://api.staging.strata-ngo.com/api";
export const LOCAL_API = "http://localhost:4000/api";
const ALLOWED_BASES = new Set([STAGING_API, LOCAL_API]);

/** Names of everything these scripts create start with this, and cleanup refuses anything else. */
export const QA_PREFIX = "ZZQA";

/** The exact identities provisioned; reuse and deactivation require a full match. */
export const QA_ACCOUNTS = {
  pm: { role: "Project Manager", fullName: `${QA_PREFIX} QA Project Manager`, emailArg: "pm-email" },
  installer: { role: "Installer", fullName: `${QA_PREFIX} QA Installer`, emailArg: "installer-email" },
};

export class SafetyError extends Error {}

/** Throws unless `base` is exactly one of the allowlisted API bases (production can never match). */
export function assertAllowedBase(base) {
  if (!ALLOWED_BASES.has(base)) throw new SafetyError(`API base "${base}" is not allowed (staging or local dev only)`);
  return base;
}

export function resolveApiBase(argv) {
  return assertAllowedBase(argv.includes("--local") ? LOCAL_API : STAGING_API);
}

export function parseArgs(argv) {
  const value = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };
  return { apply: argv.includes("--apply"), local: argv.includes("--local"), deactivate: argv.includes("--deactivate"), value };
}

/**
 * An API failure with no response body attached. `kind` lets callers tell an authorization
 * failure or an outage apart from a resource that is genuinely gone.
 */
export class ApiError extends Error {
  constructor(method, route, status, kind) {
    super(`${method} ${route} → ${status === 0 ? "network error" : `HTTP ${status}`} (${kind})`);
    this.method = method; this.route = route; this.status = status; this.kind = kind;
  }
}
const KIND_BY_STATUS = { 400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict", 422: "unprocessable" };

export function createApi({ base, fetchImpl = globalThis.fetch }) {
  assertAllowedBase(base);
  return async function call(method, route, { token, body } = {}) {
    let res;
    try {
      res = await fetchImpl(`${base}${route}`, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(method, route, 0, "network"); // the underlying error is dropped: it can include request details
    }
    if (!res.ok) {
      await res.text().catch(() => ""); // drain, never surface
      throw new ApiError(method, route, res.status, KIND_BY_STATUS[res.status] ?? (res.status >= 500 ? "server_error" : "http_error"));
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}

/** Password login only: 2FA-enabled accounts are refused (see README §Security). */
export async function login(call, email, password) {
  let r;
  try {
    r = await call("POST", "/auth/login", { body: { email, password } });
  } catch (err) {
    if (err instanceof ApiError) throw new ApiError("POST", "/auth/login", err.status, err.status === 401 ? "login_rejected" : err.kind);
    throw err;
  }
  if (r?.requires2fa) throw new SafetyError("Account has 2FA enabled: these scripts use a non-2FA staging QA account (see README §Security)");
  if (!r?.token) throw new SafetyError("Login returned no token (first-login/password-expired accounts must finish setup in the browser first)");
  return { token: r.token, user: r.user };
}

/**
 * A secret from env var `envName`, else the macOS Keychain item `service`/`account`. Returned to
 * the caller only; the error names where to put it, never a value.
 */
export function secret(envName, service, account, { env = process.env, platform = process.platform, execFile = execFileSync } = {}) {
  if (env[envName]) return env[envName];
  if (platform === "darwin") {
    try {
      return execFile("security", ["find-generic-password", "-s", service, "-a", account, "-w"], {
        encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch { /* not in keychain */ }
  }
  throw new SafetyError(`Missing credential: set ${envName} or add Keychain item service="${service}" account="${account}"`);
}

export const consoleLog = (msg) => process.stdout.write(`[staging-qa] ${msg}\n`);

/** State lives outside the repo so IDs (and nothing secret) survive between seed and cleanup. */
export function fileState(local, dir = path.join(os.homedir(), ".strata-ngo-qa")) {
  const file = path.join(dir, local ? "state-local.json" : "state-staging.json");
  return {
    read() { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } },
    write(state) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 }); },
  };
}

export function stamp(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
}

/** Run `main` only when the file is executed directly; failures print one line, never a stack. */
export function runIfMain(metaUrl, main) {
  if (!process.argv[1] || metaUrl !== pathToFileURL(process.argv[1]).href) return;
  main().catch((err) => {
    process.stderr.write(`[staging-qa] ERROR: ${err instanceof ApiError || err instanceof SafetyError ? err.message : "unexpected failure (details suppressed)"}\n`);
    process.exit(1);
  });
}
