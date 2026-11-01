#!/usr/bin/env node
// Create (or deactivate) the dedicated staging QA accounts. ADMIN-ONLY: run by a human staging
// admin, because creating users is Admin-only in the API (UsersController [Authorize(Roles="Admin")]).
//
// The admin supplies their own short-lived session token (ADMIN_TOKEN env var or Keychain item
// "strata-ngo-staging-admin-token"), never a password. Users are created inactive with an unusable
// random password (server-side) and receive the normal 24 h invite link, so each QA person sets
// their own password — nobody else ever sees it.
//
//   node scripts/staging-qa/provision-users.mjs --pm-email=<mailbox you control> --installer-email=<mailbox you control> [--apply]
//   node scripts/staging-qa/provision-users.mjs --deactivate [--apply]   # cleanup: disable both QA users
//   add --local to target a local dev API (http://localhost:4000/api) instead of staging
import { QA_ACCOUNTS, SafetyError, consoleLog, createApi, fileState, parseArgs, resolveApiBase, runIfMain, secret } from "./qa-lib.mjs";

const sameEmail = (a, b) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** Throws unless `user` is exactly the provisioned QA identity for `key`. */
export function assertQaIdentity(key, user, { email, id } = {}) {
  const want = QA_ACCOUNTS[key];
  const problems = [];
  if (id !== undefined && user.id !== id) problems.push("id differs from the recorded id");
  if (email !== undefined && !sameEmail(user.email, email)) problems.push("email differs");
  if (user.fullName !== want.fullName) problems.push(`full name is not "${want.fullName}"`);
  if (user.role !== want.role) problems.push(`role is not "${want.role}"`);
  if (problems.length) throw new SafetyError(`${key}: account ${user.id} does not match the QA identity (${problems.join("; ")}) — refusing`);
}

export async function provisionUsers({ call, token, apply, deactivate, emails = {}, state = {}, log = consoleLog }) {
  const next = { ...state, users: { ...(state.users ?? {}) } };
  const users = await call("GET", "/users", { token });

  if (deactivate) {
    for (const key of Object.keys(QA_ACCOUNTS)) {
      const rec = next.users[key];
      if (!rec?.id) { log(`${key}: no recorded QA user — nothing to deactivate`); continue; }
      const u = users.find((x) => x.id === rec.id);
      if (!u) { log(`${key}: recorded user ${rec.id} not found — nothing to deactivate`); continue; }
      assertQaIdentity(key, u, { email: rec.email, id: rec.id });
      if (!u.isActive && !apply) { log(`${key}: already inactive`); continue; }
      log(`${key}: deactivate ${u.fullName} (active=${u.isActive})`);
      if (!apply) continue;
      if (u.isActive) await call("PATCH", `/users/${u.id}`, { token, body: { isActive: false } });
      const after = (await call("GET", "/users", { token })).find((x) => x.id === u.id);
      if (!after || after.isActive) throw new SafetyError(`${key}: deactivation not verified (user still active)`);
      log(`${key}: inactive (verified)`);
    }
    return next;
  }

  // role-configs.roles is a dictionary keyed by role name (empty when unconfigured; the server
  // still validates the role on create).
  const roleNames = new Set(Object.keys((await call("GET", "/role-configs", { token }))?.roles ?? {}));
  for (const [key, want] of Object.entries(QA_ACCOUNTS)) {
    const email = emails[key];
    if (!email) throw new SafetyError(`--${want.emailArg}=<address> is required (a mailbox you control: the invite link is sent there)`);
    if (roleNames.size && !roleNames.has(want.role)) throw new SafetyError(`Role "${want.role}" is not configured on this environment`);
    const rec = next.users[key];
    if (rec?.id && !sameEmail(rec.email, email)) throw new SafetyError(`${key}: a different QA user (${rec.id}) is already recorded — deactivate it first`);
    const existing = users.find((u) => sameEmail(u.email, email));
    if (existing) {
      assertQaIdentity(key, existing, { email, id: rec?.id });
      next.users[key] = { id: existing.id, email };
      if (existing.isActive) { log(`${key}: exists and is active — left unchanged (no re-invite)`); continue; }
      log(`${key}: exists, not yet activated — re-sending invite`);
    } else {
      log(`${key}: create ${want.fullName} role "${want.role}"`);
      if (!apply) continue;
      const created = await call("POST", "/users", { token, body: { fullName: want.fullName, email, role: want.role, office: "" } });
      assertQaIdentity(key, created, { email });
      next.users[key] = { id: created.id, email };
    }
    if (apply) {
      await call("POST", `/users/${next.users[key].id}/invite`, { token });
      log(`${key}: invite sent (link valid 24 h)`);
    }
  }
  return next;
}

runIfMain(import.meta.url, async () => {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  const call = createApi({ base: resolveApiBase(argv) });
  const store = fileState(opts.local);
  consoleLog(`API ${resolveApiBase(argv)} · ${opts.apply ? "APPLY" : "DRY RUN (pass --apply to write)"}`);
  const next = await provisionUsers({
    call, token: secret("ADMIN_TOKEN", "strata-ngo-staging-admin-token", "admin"), apply: opts.apply, deactivate: opts.deactivate,
    emails: { pm: opts.value("pm-email"), installer: opts.value("installer-email") }, state: store.read() ?? {},
  });
  if (opts.apply) store.write(next);
});
