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
import { APPLY, QA_PREFIX, api, apiBase, log, login, readState, secret, stamp, writeState } from "./qa-lib.mjs";

const state = readState() ?? {};
if (state.project?.id && APPLY) throw new Error(`A QA project (${state.project.jobNumber}) is already recorded — run cleanup-project.mjs first`);

const email = secret("QA_PM_EMAIL", "strata-ngo-staging-qa", "pm-email");
const { token, user } = await login(email, secret("QA_PM_PASSWORD", "strata-ngo-staging-qa", "pm-password"));
if (user?.role !== "Project Manager") throw new Error(`QA seed must run as the QA Project Manager (got role ${user?.role})`);
log(`API ${apiBase()} · signed in as ${user.fullName} · ${APPLY ? "APPLY" : "DRY RUN (pass --apply to write)"}`);

// Published configs per workflow type (no list-all endpoint: walk products → by-product).
const types = await api("GET", "/workflow-types", { token });
const products = await api("GET", "/products", { token });
const configByType = new Map();
for (const p of products) {
  for (const c of await api("GET", `/workflow-configs/by-product/${p.id}`, { token })) {
    if (c.status === "Published" && c.workflowTypeId && !configByType.has(c.workflowTypeId)) configByType.set(c.workflowTypeId, { ...c, productId: p.id });
  }
}
const plan = types.filter((t) => t.isActive).map((t) => ({ type: t, config: configByType.get(t.id) }));
for (const { type, config } of plan) log(`type ${type.name}: ${config ? `config "${config.displayName ?? config.name}"` : "NO published config — no asset (see README)"}`);

const run = stamp();
const jobNumber = `${QA_PREFIX}-${run}`;
const installerId = state.users?.installer?.id;
if (!APPLY) { log(`would create customer "${QA_PREFIX} QA Customer", project ${jobNumber}, ${plan.filter((p) => p.config).length} assets`); process.exit(0); }

const customer = await api("POST", "/customers", { token, body: { name: `${QA_PREFIX} QA Customer ${run}`, customerId: `${QA_PREFIX}-${run}`, office: "", industry: "QA", logo: null, logoShape: null, photoScale: null, logoSize: null } });
const today = new Date().toISOString().slice(0, 10);
const project = await api("POST", "/projects", { token, body: {
  id: "", customerName: customer.name, customerId: customer.id, siteId: null, siteName: null, jobNumber, purchaseOrderNumber: "",
  description: `Automated staging QA project ${run} — safe to delete`, startDate: today, finishDate: today, office: "", region: null,
  projectType: "Internal", status: "Draft", approvalDecision: null, isInstallationProject: true, installationMode: null,
  projectManager: user.id, contractValue: null, probabilityStage: null, minimumCompletionPercent: 0, completedAtUtc: null,
  completedBy: null, closedAtUtc: null, closedBy: null, productIds: [...new Set(plan.filter((p) => p.config).map((p) => p.config.productId))],
  productFeatureValues: {}, workflowMode: "MIXED", teamMemberIds: installerId ? [installerId] : [], timeZoneId: "Australia/Sydney",
} });
await api("PATCH", `/projects/${project.id}/status`, { token, body: { status: "Approved", approvalDecision: "Approved" } });
state.customer = { id: customer.id, name: customer.name };
state.project = { id: project.id, jobNumber };
state.assets = [];
writeState(state); // persist before assets so a partial failure is still cleanable

for (const { type, config } of plan.filter((p) => p.config)) {
  const tag = `${QA_PREFIX}-${type.name.replace(/[^A-Za-z0-9]+/g, "").slice(0, 16).toUpperCase()}`;
  const asset = await api("POST", "/project-assets", { token, body: {
    projectId: project.id, productId: config.productId, productConfigId: config.id, workflowTemplateId: null, assetTag: tag,
    assetName: `${QA_PREFIX} ${type.name} asset`, serialNumber: null, assetModel: null, manufacturer: null, location: "QA",
    assignedUserId: installerId ?? null, status: "Not Started", workOrderId: null, notes: `QA ${run}`,
  } });
  state.assets.push({ id: asset.id, tag, type: type.name });
  writeState(state);
  log(`asset ${tag} (${type.name}) → ${asset.id}`);
}
log(`seeded project ${jobNumber} (${project.id}) with ${state.assets.length} assets`);
