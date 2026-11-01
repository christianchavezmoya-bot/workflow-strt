#!/usr/bin/env node
// Remove exactly the QA records seed-project.mjs created (IDs from the state file), as the QA
// Project Manager. Refuses anything whose name/job number doesn't carry the ZZQA prefix.
//   - project: soft delete (also soft-deletes its assets) — restorable; hard purge is Admin-only
//     and optional (see README)
//   - customer: deleted
// Then deactivate the QA users with: provision-users.mjs --deactivate --apply (admin).
//
//   node scripts/staging-qa/cleanup-project.mjs [--apply] [--local]
import { APPLY, QA_PREFIX, api, apiBase, log, login, readState, secret, writeState } from "./qa-lib.mjs";

const state = readState();
if (!state?.project?.id && !state?.customer?.id) { log("nothing recorded — nothing to clean up"); process.exit(0); }

const { token, user } = await login(
  secret("QA_PM_EMAIL", "strata-ngo-staging-qa", "pm-email"),
  secret("QA_PM_PASSWORD", "strata-ngo-staging-qa", "pm-password"),
);
log(`API ${apiBase()} · signed in as ${user.fullName} · ${APPLY ? "APPLY" : "DRY RUN (pass --apply to write)"}`);

if (state.project?.id) {
  const p = await api("GET", `/projects/${state.project.id}`, { token }).catch(() => null);
  if (p && !p.jobNumber?.startsWith(`${QA_PREFIX}-`)) throw new Error(`Recorded project ${state.project.id} is not a ${QA_PREFIX} project — refusing`);
  log(`project ${state.project.jobNumber}: ${p ? "soft delete (assets included)" : "already gone"}`);
  if (APPLY && p) await api("DELETE", `/projects/${state.project.id}`, { token });
}
if (state.customer?.id) {
  const customers = await api("GET", "/customers", { token });
  const c = customers.find((x) => x.id === state.customer.id);
  if (c && !c.name?.startsWith(QA_PREFIX)) throw new Error(`Recorded customer ${state.customer.id} is not a ${QA_PREFIX} customer — refusing`);
  log(`customer ${state.customer.name}: ${c ? "delete" : "already gone"}`);
  if (APPLY && c) await api("DELETE", `/customers/${state.customer.id}`, { token });
}
if (APPLY) {
  writeState({ users: state.users, cleaned: { project: state.project, customer: state.customer, at: new Date().toISOString() } });
  log("done — next (admin): provision-users.mjs --deactivate --apply");
}
