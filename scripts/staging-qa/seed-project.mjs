#!/usr/bin/env node
// Create the isolated QA test data as the QA Project Manager (never as an admin):
//   one ZZQA customer, one Internal ZZQA project, and one asset per workflow type that has a
//   Published workflow config on this environment (Installation / Inspection / Commissioning /
//   Repair / Other / custom), assigned to the QA Installer. Created IDs go to the state file so
//   cleanup-project.mjs removes exactly these records and nothing else.
//
// Credentials: QA_PM_EMAIL / QA_PM_PASSWORD env vars, or Keychain service "strata-ngo-staging-qa"
// with accounts "pm-email" / "pm-password". Never printed.
//
//   node scripts/staging-qa/seed-project.mjs [--apply] [--local]
import { QA_ACCOUNTS, QA_PREFIX, SafetyError, consoleLog, createApi, fileState, login, parseArgs, resolveApiBase, runIfMain, secret, stamp } from "./qa-lib.mjs";

export async function seedProject({ call, email, password, apply, state = {}, log = consoleLog, now = new Date(), onProgress = () => {} }) {
  if (state.project?.id && apply) throw new SafetyError(`A QA project (${state.project.jobNumber}) is already recorded — run cleanup-project.mjs first`);
  const { token, user } = await login(call, email, password);
  if (user?.role !== QA_ACCOUNTS.pm.role || user?.fullName !== QA_ACCOUNTS.pm.fullName) {
    throw new SafetyError("QA seed must run as the ZZQA QA Project Manager account");
  }
  log(`signed in as ${user.fullName} · ${apply ? "APPLY" : "DRY RUN (pass --apply to write)"}`);

  // Published configs per workflow type (no list-all endpoint: walk products → by-product).
  const types = await call("GET", "/workflow-types", { token });
  const products = await call("GET", "/products", { token });
  const configByType = new Map();
  for (const p of products) {
    for (const c of await call("GET", `/workflow-configs/by-product/${p.id}`, { token })) {
      if (c.status === "Published" && c.workflowTypeId && !configByType.has(c.workflowTypeId)) configByType.set(c.workflowTypeId, { ...c, productId: p.id });
    }
  }
  const plan = types.filter((t) => t.isActive).map((t) => ({ type: t, config: configByType.get(t.id) }));
  for (const { type, config } of plan) log(`type ${type.name}: ${config ? `config "${config.displayName ?? config.name}"` : "NO published config — no asset (see README)"}`);

  const run = stamp(now);
  const jobNumber = `${QA_PREFIX}-${run}`;
  const installerId = state.users?.installer?.id;
  const withConfig = plan.filter((p) => p.config);
  if (!apply) { log(`would create customer, project ${jobNumber}, ${withConfig.length} assets`); return state; }

  const next = { ...state };
  const customer = await call("POST", "/customers", { token, body: { name: `${QA_PREFIX} QA Customer ${run}`, customerId: `${QA_PREFIX}-${run}`, office: "", industry: "QA", logo: null, logoShape: null, photoScale: null, logoSize: null } });
  next.customer = { id: customer.id, name: customer.name };
  onProgress(next); // recorded immediately so a later failure is still cleanable
  const today = now.toISOString().slice(0, 10);
  const project = await call("POST", "/projects", { token, body: {
    id: "", customerName: customer.name, customerId: customer.id, siteId: null, siteName: null, jobNumber, purchaseOrderNumber: "",
    description: `Automated staging QA project ${run} — safe to delete`, startDate: today, finishDate: today, office: "", region: null,
    projectType: "Internal", status: "Draft", approvalDecision: null, isInstallationProject: true, installationMode: null,
    projectManager: user.id, contractValue: null, probabilityStage: null, minimumCompletionPercent: 0, completedAtUtc: null,
    completedBy: null, closedAtUtc: null, closedBy: null, productIds: [...new Set(withConfig.map((p) => p.config.productId))],
    productFeatureValues: {}, workflowMode: "MIXED", teamMemberIds: installerId ? [installerId] : [], timeZoneId: "Australia/Sydney",
  } });
  next.project = { id: project.id, jobNumber };
  next.assets = [];
  onProgress(next);
  await call("PATCH", `/projects/${project.id}/status`, { token, body: { status: "Approved", approvalDecision: "Approved" } });

  for (const { type, config } of withConfig) {
    const tag = `${QA_PREFIX}-${type.name.replace(/[^A-Za-z0-9]+/g, "").slice(0, 16).toUpperCase()}`;
    const asset = await call("POST", "/project-assets", { token, body: {
      projectId: project.id, productId: config.productId, productConfigId: config.id, workflowTemplateId: null, assetTag: tag,
      assetName: `${QA_PREFIX} ${type.name} asset`, serialNumber: null, assetModel: null, manufacturer: null, location: "QA",
      assignedUserId: installerId ?? null, status: "Not Started", workOrderId: null, notes: `QA ${run}`,
    } });
    next.assets.push({ id: asset.id, tag, type: type.name });
    onProgress(next);
    log(`asset ${tag} (${type.name}) → ${asset.id}`);
  }
  log(`seeded project ${jobNumber} (${project.id}) with ${next.assets.length} assets`);
  return next;
}

runIfMain(import.meta.url, async () => {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  const call = createApi({ base: resolveApiBase(argv) });
  const store = fileState(opts.local);
  consoleLog(`API ${resolveApiBase(argv)}`);
  await seedProject({
    call, apply: opts.apply, state: store.read() ?? {}, onProgress: (s) => store.write(s),
    email: secret("QA_PM_EMAIL", "strata-ngo-staging-qa", "pm-email"),
    password: secret("QA_PM_PASSWORD", "strata-ngo-staging-qa", "pm-password"),
  });
});
