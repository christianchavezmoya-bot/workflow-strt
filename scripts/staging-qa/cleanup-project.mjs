#!/usr/bin/env node
// Remove exactly the QA records seed-project.mjs created (IDs from the state file), as the QA
// Project Manager. Every outcome is verified, never assumed:
//   - "absent"  : the API answered 404 for the recorded ID
//   - "deleted" : after DELETE, the record reads back as deleted (project: isDeleted=true via
//                 ?includeDeleted=true; customer: no longer listed)
//   - any 401/403/network/server error aborts with nothing further touched
// Refuses anything whose name/job number doesn't match the recorded ZZQA record.
//   - project: soft delete (also soft-deletes its assets) — restorable; hard purge is Admin-only
//   - customer: deleted (only after the project step succeeded)
// Then deactivate the QA users with: provision-users.mjs --deactivate --apply (admin).
//
//   node scripts/staging-qa/cleanup-project.mjs [--apply] [--local]
import { ApiError, QA_PREFIX, SafetyError, consoleLog, createApi, fileState, login, parseArgs, resolveApiBase, runIfMain, secret } from "./qa-lib.mjs";

async function getOrAbsent(call, route, token) {
  try {
    return await call("GET", route, { token });
  } catch (err) {
    if (err instanceof ApiError && err.kind === "not_found") return null;
    throw new SafetyError(`cannot verify ${route}: ${err.message} — aborting, nothing further changed`);
  }
}

export async function cleanupProject({ call, email, password, apply, state, log = consoleLog }) {
  const result = { project: "none-recorded", customer: "none-recorded" };
  if (!state?.project?.id && !state?.customer?.id) { log("nothing recorded — nothing to clean up"); return { result, state }; }
  const { token, user } = await login(call, email, password);
  log(`signed in as ${user.fullName} · ${apply ? "APPLY" : "DRY RUN (pass --apply to write)"}`);

  if (state.project?.id) {
    const route = `/projects/${state.project.id}?includeDeleted=true`;
    const p = await getOrAbsent(call, route, token);
    if (!p) {
      result.project = "absent";
    } else {
      if (!p.jobNumber?.startsWith(`${QA_PREFIX}-`) || p.jobNumber !== state.project.jobNumber) {
        throw new SafetyError(`recorded project ${state.project.id} is not the recorded ${QA_PREFIX} project — refusing`);
      }
      if (p.isDeleted) {
        result.project = "already-deleted";
      } else if (!apply) {
        result.project = "would-delete";
      } else {
        try { await call("DELETE", `/projects/${state.project.id}`, { token }); }
        catch (err) { throw new SafetyError(`project delete failed: ${err.message} — customer left untouched`); }
        const after = await getOrAbsent(call, route, token);
        if (after && !after.isDeleted) throw new SafetyError("project delete not verified (still not deleted) — customer left untouched");
        result.project = "deleted";
      }
    }
    log(`project ${state.project.jobNumber}: ${result.project}`);
  }

  if (state.customer?.id) {
    const listed = async () => {
      try { return (await call("GET", "/customers", { token })).find((x) => x.id === state.customer.id) ?? null; }
      catch (err) { throw new SafetyError(`cannot verify customer: ${err.message} — aborting`); }
    };
    const c = await listed();
    if (!c) {
      result.customer = "absent";
    } else {
      if (!c.name?.startsWith(QA_PREFIX) || c.name !== state.customer.name) {
        throw new SafetyError(`recorded customer ${state.customer.id} is not the recorded ${QA_PREFIX} customer — refusing`);
      }
      if (!apply) {
        result.customer = "would-delete";
      } else {
        try { await call("DELETE", `/customers/${state.customer.id}`, { token }); }
        catch (err) { throw new SafetyError(`customer delete failed: ${err.message}`); }
        if (await listed()) throw new SafetyError("customer delete not verified (still listed)");
        result.customer = "deleted";
      }
    }
    log(`customer ${state.customer.name}: ${result.customer}`);
  }

  const next = apply ? { users: state.users, cleaned: { project: state.project, customer: state.customer, result } } : state;
  if (apply) log("done — next (admin): provision-users.mjs --deactivate --apply");
  return { result, state: next };
}

runIfMain(import.meta.url, async () => {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  const call = createApi({ base: resolveApiBase(argv) });
  const store = fileState(opts.local);
  consoleLog(`API ${resolveApiBase(argv)}`);
  const { state } = await cleanupProject({
    call, apply: opts.apply, state: store.read(),
    email: secret("QA_PM_EMAIL", "strata-ngo-staging-qa", "pm-email"),
    password: secret("QA_PM_PASSWORD", "strata-ngo-staging-qa", "pm-password"),
  });
  if (opts.apply) store.write(state);
});
