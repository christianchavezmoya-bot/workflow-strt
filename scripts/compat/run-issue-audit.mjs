#!/usr/bin/env node
// READ-ONLY compatibility audit for #392: which stored run issue lists the new API contract would
// refuse to update. It reads run ids, issue lists and workflow-type metadata, and prints counts and
// run ids only (never issue text). It never writes:
//   - SQLite: opened with `sqlite3 -readonly`
//   - Postgres: `psql` with PGOPTIONS=-c default_transaction_read_only=on (every statement in the
//     session is read-only; any write would error)
//
//   node scripts/compat/run-issue-audit.mjs --sqlite path/to/commtrac.db
//   node scripts/compat/run-issue-audit.mjs --postgres      # connection from PGHOST/PGPORT/PGDATABASE/PGUSER
//                                                           # (+ PGPASSWORD or ~/.pgpass), set by the operator
// Use a read-only database role where possible. The script never prints connection settings.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { classifyStoredIssues } from "./run-issue-classifier.mjs";

const QUERY = `
SELECT r."Id" AS "runId", r."IsLocked" AS "isLocked", r."Status" AS "status", r."SignatureStatus" AS "signatureStatus",
       r."IssuesJson" AS "issuesJson", wt."Name" AS "workflowType", c."ConfigType" AS "configType",
       p."WorkflowMode" AS "workflowMode", p."IsDeleted" AS "projectDeleted"
FROM "AssetWorkflowRuns" r
LEFT JOIN "WorkflowConfigs" c ON c."Id" = r."WorkflowConfigId"
LEFT JOIN "WorkflowTypes" wt ON wt."Id" = c."WorkflowTypeId"
LEFT JOIN "ProjectAssets" a ON a."Id" = r."AssetId"
LEFT JOIN "Projects" p ON p."Id" = a."ProjectId"`;

function readRows(argv) {
  const sqliteIdx = argv.indexOf("--sqlite");
  if (sqliteIdx >= 0) {
    const out = execFileSync("sqlite3", ["-readonly", "-json", argv[sqliteIdx + 1], QUERY], { encoding: "utf8", maxBuffer: 1 << 30 });
    return out.trim() ? JSON.parse(out) : [];
  }
  if (argv.includes("--postgres")) {
    const sql = `SELECT COALESCE(json_agg(t), '[]'::json) FROM (${QUERY}) t;`;
    const out = execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
      encoding: "utf8", maxBuffer: 1 << 30,
      env: { ...process.env, PGOPTIONS: `${process.env.PGOPTIONS ?? ""} -c default_transaction_read_only=on`.trim() },
    });
    return JSON.parse(out);
  }
  throw new Error("usage: --sqlite <db file> | --postgres");
}

export function summarize(rows) {
  const summary = { totalRuns: rows.length, ok: 0, stored_unreadable: 0, resend_rejected: 0, byWorkflowType: {}, byReason: {}, openRunsAffected: 0, affectedRunIds: [] };
  for (const row of rows) {
    const { status, reasons } = classifyStoredIssues(row.issuesJson);
    summary[status] += 1;
    if (status === "ok") continue;
    const type = row.workflowType ?? (row.configType ? `legacy:${row.configType}` : "unknown");
    const bucket = (summary.byWorkflowType[type] ??= { stored_unreadable: 0, resend_rejected: 0 });
    bucket[status] += 1;
    for (const reason of reasons) summary.byReason[reason] = (summary.byReason[reason] ?? 0) + 1;
    const locked = row.isLocked === 1 || row.isLocked === true;
    if (!locked) summary.openRunsAffected += 1;
    summary.affectedRunIds.push({ runId: row.runId, status, reasons, workflowType: type, locked: Boolean(locked), workflowMode: row.workflowMode ?? null });
  }
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(summarize(readRows(process.argv.slice(2))), null, 2));
  } catch (err) {
    // Database client errors can echo host / user names: keep them out of output and logs.
    console.error(err?.message?.startsWith("usage:") ? `run-issue-audit: ${err.message}` : "run-issue-audit: query failed (check the connection settings and read access)");
    process.exit(1);
  }
}
