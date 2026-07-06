#!/usr/bin/env node
/**
 * Seed a published workflow config for AIM-100 and assign it to JOB-4021 assets,
 * so the Assets page shows "Start Run" and the runner can be recorded for videos.
 *
 * Idempotent-ish: creates a new config each run but only assigns to assets that
 * have no active assignment.
 */
const API = process.env.API_BASE ?? "http://localhost:4000/api";
const ADMIN = { email: "admin@commtrac.local", password: "Admin123!" };
const PROJECT_ID = "9ab1516f-b622-4d60-9c74-030e54023469";
const PRODUCT_ID = "13f4fed7-27aa-4e36-b339-137b6b010574";
const WORKFLOW_TYPE_ID = "wftype-installation";

async function main() {
  const loginRes = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ADMIN),
  });
  const { token } = await loginRes.json();
  if (!token) throw new Error("login failed");
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // Resolve current (admin) user id from JWT so we can self-assign assets
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
  const adminUserId = payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"];
  console.log("admin user id", adminUserId);

  // Check existing published configs for this product
  const existing = await (await fetch(`${API}/workflow-configs/by-product/${PRODUCT_ID}`, { headers: H })).json();
  let config = (Array.isArray(existing) ? existing : []).find((c) => c.status === "Published" && c.name?.startsWith("AIM-100 Install"));

  if (!config) {
    const steps = [
      {
        id: "s1", order: 1, title: "Site preparation & permits",
        description: "Confirm site access, PPE, and lockout/tagout before starting the install.",
        overrideInReport: false, overrideReportText: "", includeDescriptionInReport: true,
        mediaIds: [], decisionsEnabled: false, decisions: [], nextStepId: "s2", stepType: "preparation",
        inputs: [
          { id: "s1i1", type: "checkbox", label: "PPE verified and site safe", required: true },
          { id: "s1i2", type: "checkbox", label: "Lockout / tagout applied", required: true },
        ],
        captureFields: [],
      },
      {
        id: "s2", order: 2, title: "Mount & connect AIM-100 unit",
        description: "Mount the controller, connect power and network, and photograph the installation.",
        overrideInReport: false, overrideReportText: "", includeDescriptionInReport: true,
        mediaIds: [], decisionsEnabled: false, decisions: [], nextStepId: "s3", stepType: "installation",
        inputs: [
          { id: "s2i1", type: "photo", label: "Photo of mounted unit", required: true },
          { id: "s2i2", type: "photo", label: "Photo of cable connections", required: false },
        ],
        captureFields: [
          { id: "s2c1", key: "serialNumber", label: "Serial Number", type: "scan", required: true, hint: "Scan or type the unit serial" },
          { id: "s2c2", key: "firmwareVersion", label: "Firmware Version", type: "text", required: false },
        ],
      },
      {
        id: "s3", order: 3, title: "Power-on & signal test",
        description: "Power on the unit and record signal readings to confirm acceptance.",
        overrideInReport: false, overrideReportText: "", includeDescriptionInReport: true,
        mediaIds: [], decisionsEnabled: false, decisions: [], nextStepId: "s4", stepType: "test-acceptance",
        inputs: [
          { id: "s3i1", type: "checkbox", label: "Unit powers on and boots", required: true },
        ],
        captureFields: [
          { id: "s3c1", key: "signalStrength", label: "Signal Strength", type: "number", required: true, unit: "dBm" },
        ],
      },
      {
        id: "s4", order: 4, title: "Final inspection & sign-off",
        description: "Review the installation, capture a final photo, and confirm the work is complete.",
        overrideInReport: false, overrideReportText: "", includeDescriptionInReport: true,
        mediaIds: [], decisionsEnabled: false, decisions: [], nextStepId: null, stepType: "final-inspection",
        inputs: [
          { id: "s4i1", type: "photo", label: "Final installation photo", required: true },
          { id: "s4i2", type: "note", label: "Technician notes", required: false },
        ],
        captureFields: [],
      },
    ];

    const created = await (await fetch(`${API}/workflow-configs`, {
      method: "POST", headers: H,
      body: JSON.stringify({
        productId: PRODUCT_ID,
        name: "AIM-100 Install v1",
        displayName: "AIM-100 Installation",
        configType: "installation",
        workflowTypeId: WORKFLOW_TYPE_ID,
        stepsJson: JSON.stringify(steps),
        notes: "Demo workflow for presentation recording.",
      }),
    })).json();
    console.log("created config", created.id);

    const pub = await fetch(`${API}/workflow-configs/${created.id}/publish`, { method: "POST", headers: H });
    console.log("publish status", pub.status);
    config = { ...created, status: "Published" };
  } else {
    console.log("reusing published config", config.id);
  }

  // Assign to all assets that lack an active assignment
  const assets = await (await fetch(`${API}/project-assets/by-project/${PROJECT_ID}`, { headers: H })).json();
  for (const a of assets) {
    // Self-assign the asset to the admin user so "Start Run" opens the runner
    // directly (no auto-assign confirmation dialog). PUT persists before the
    // (crashing) notification call, so a 500 is still effective.
    if (a.assignedUserId !== adminUserId) {
      await fetch(`${API}/project-assets/${a.id}`, {
        method: "PUT", headers: H,
        body: JSON.stringify({ assetTag: a.assetTag, assignedUserId: adminUserId }),
      }).catch(() => {});
      const chk = await (await fetch(`${API}/project-assets/${a.id}`, { headers: H })).json();
      console.log(`self-assign ${a.assetTag}: assignedUserId=${chk.assignedUserId === adminUserId}`);
    }

    const existingAssign = await (await fetch(`${API}/asset-workflow-assignments/by-asset/${a.id}`, { headers: H })).json();
    if (Array.isArray(existingAssign) && existingAssign.some((x) => x.active)) {
      console.log(`asset ${a.assetTag} already assigned`);
      continue;
    }
    const res = await fetch(`${API}/asset-workflow-assignments`, {
      method: "POST", headers: H,
      body: JSON.stringify({ assetId: a.id, workflowConfigId: config.id, workflowTypeId: WORKFLOW_TYPE_ID }),
    });
    // NOTE: the API returns 500 due to a missing NotificationInbox table, but the
    // assignment row is saved before the notification call, so it persists fine.
    const verify = await (await fetch(`${API}/asset-workflow-assignments/by-asset/${a.id}`, { headers: H })).json();
    const ok = Array.isArray(verify) && verify.some((x) => x.active);
    console.log(`assign ${a.assetTag}: http ${res.status} → active=${ok}`);
  }

  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
