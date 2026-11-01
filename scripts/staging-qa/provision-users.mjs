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
import { APPLY, QA_PREFIX, api, apiBase, argValue, args, log, readState, secret, writeState } from "./qa-lib.mjs";

const ROLES = [
  // Least privilege that still covers the acceptance matrix: Project Manager is the lowest role
  // allowed to create the isolated customer/project/assets and send e-sign links; it cannot manage
  // users, roles, settings or purge records. The Installer account runs workflows and signs as
  // technician, like a field user.
  { key: "pm", role: "Project Manager", fullName: `${QA_PREFIX} QA Project Manager`, emailArg: "pm-email" },
  { key: "installer", role: "Installer", fullName: `${QA_PREFIX} QA Installer`, emailArg: "installer-email" },
];

const token = secret("ADMIN_TOKEN", "strata-ngo-staging-admin-token", "admin");
log(`API ${apiBase()} · ${APPLY ? "APPLY" : "DRY RUN (pass --apply to write)"}`);

const users = await api("GET", "/users", { token });
const state = readState() ?? {};
state.users ??= {};

if (args.has("--deactivate")) {
  for (const { key } of ROLES) {
    const id = state.users[key]?.id;
    const u = users.find((x) => x.id === id);
    if (!u) { log(`${key}: no recorded QA user — nothing to deactivate`); continue; }
    if (!u.fullName?.startsWith(QA_PREFIX)) throw new Error(`${key}: recorded user ${id} is not a ${QA_PREFIX} account — refusing`);
    log(`${key}: deactivate ${u.fullName} <${u.email}> (active=${u.isActive})`);
    if (APPLY) await api("PATCH", `/users/${id}`, { token, body: { isActive: false } });
  }
  process.exit(0);
}

// roles is a dictionary keyed by role name (empty when the environment has no custom config;
// the server still validates the role on create).
const roleNames = new Set(Object.keys((await api("GET", "/role-configs", { token }))?.roles ?? {}));
for (const { key, role, fullName, emailArg } of ROLES) {
  const email = argValue(emailArg);
  if (!email) throw new Error(`--${emailArg}=<address> is required (a mailbox you control: the invite link is sent there)`);
  if (roleNames.size && !roleNames.has(role)) throw new Error(`Role "${role}" is not configured on this environment`);
  const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing && !existing.fullName?.startsWith(QA_PREFIX)) throw new Error(`${email} already belongs to a non-QA user — refusing to touch it`);
  if (existing) {
    log(`${key}: exists (${existing.id}, role ${existing.role}, active=${existing.isActive}) — re-sending invite only`);
    state.users[key] = { id: existing.id, email };
  } else {
    log(`${key}: create ${fullName} <${email}> role "${role}"`);
    if (APPLY) {
      const created = await api("POST", "/users", { token, body: { fullName, email, role, office: "" } });
      state.users[key] = { id: created.id, email };
    }
  }
  if (APPLY && state.users[key]) {
    await api("POST", `/users/${state.users[key].id}/invite`, { token });
    log(`${key}: invite sent to ${email} (link valid 24 h)`);
  }
}
if (APPLY) writeState(state);
