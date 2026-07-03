#!/usr/bin/env node
// Enterprise dev-practices quality-gate runner for Commtrac Codex 915.
//
// Runs the local equivalents of a CI pipeline against THIS repo and reports
// pass/fail per gate. Every gate here is a command verified to run in the repo;
// this script is the single source of truth for "is the change shippable".
//
// Usage (from repo root):
//   node .claude/skills/enterprise-dev-practices/scripts/check-gates.mjs [gates...] [--full]
//
// Default gates (run if none named): typecheck  backend  test  lint  docs  hygiene
//   typecheck   frontend TS gate. Default `npx tsc -b` (typecheck only, ~24s).
//               With --full runs `npm run build` (tsc -b + vite bundle, ~26s).
//   backend     `dotnet build` in server/Commtrac.Api (the C# typecheck).
//   test        `npm test` (vitest run) — frontend unit tests.
//   lint        `npm run lint` (eslint) — NON-BLOCKING backlog gate; reports
//               error/warning counts but never fails the run (legacy codebase).
//   docs        regenerates docs/ARCHITECTURE.md and fails if content is stale.
//   hygiene     fails if build/db/log/temp artifacts are tracked in git.
// Opt-in gates (named only — heavier / need a free port):
//   backendtest `dotnet test` in server/ (boots the API against a temp DB).
//   e2e         `npm run test:e2e` (Playwright smoke; auto-starts the dev server).
//
// Exit code is nonzero if any BLOCKING gate fails — wire it into CI or a hook.

const DEFAULT_GATES = ["typecheck", "backend", "test", "lint", "docs", "hygiene"];

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// repo root = up from .claude/skills/enterprise-dev-practices
const ROOT = path.resolve(SKILL_DIR, "..", "..", "..");

const args = process.argv.slice(2);
const full = args.includes("--full");
const requested = args.filter((a) => !a.startsWith("--"));
const wants = (name) =>
  requested.length === 0 ? DEFAULT_GATES.includes(name) : requested.includes(name);

const C = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", dim: "\x1b[2m",
};
const results = [];

function run(cmd, cmdArgs, cwd) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd, stdio: ["ignore", "pipe", "pipe"], shell: true, encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = r.stdout || "";
  return { code: r.status ?? 1, out: stdout + (r.stderr || ""), stdout };
}

function record(name, ok, detail, { blocking = true } = {}) {
  results.push({ name, ok, blocking });
  const tag = !blocking
    ? `${C.yellow}INFO${C.reset}`
    : ok
      ? `${C.green}PASS${C.reset}`
      : `${C.red}FAIL${C.reset}`;
  console.log(`  [${tag}] ${C.cyan}${name}${C.reset}${detail ? ` ${C.dim}— ${detail}${C.reset}` : ""}`);
}

console.log(`${C.cyan}== enterprise dev-practices gates ==${C.reset}  (root: ${ROOT})\n`);

// --- typecheck: frontend TS gate (the ONLY typecheck in this repo) ---------
if (wants("typecheck")) {
  const [cmd, cmdArgs, label] = full
    ? ["npm", ["run", "build"], "npm run build (tsc -b + vite bundle)"]
    : ["npx", ["tsc", "-b"], "npx tsc -b (typecheck only)"];
  console.log(`${C.dim}running ${label}…${C.reset}`);
  const r = run(cmd, cmdArgs, ROOT);
  record("typecheck", r.code === 0, r.code === 0 ? label : lastLines(r.out, 12));
}

// --- backend: dotnet build (C# nullable-enabled typecheck) ------------------
if (wants("backend")) {
  const api = path.join(ROOT, "server", "Commtrac.Api");
  console.log(`${C.dim}running dotnet build…${C.reset}`);
  const r = run("dotnet", ["build", "--nologo", "-clp:ErrorsOnly"], api);
  record("backend", r.code === 0, r.code === 0 ? "dotnet build" : lastLines(r.out, 12));
}

// --- test: frontend unit tests (vitest) ------------------------------------
if (wants("test")) {
  console.log(`${C.dim}running npm test (vitest run)…${C.reset}`);
  const r = run("npm", ["test", "--silent"], ROOT);
  const m = r.out.match(/Tests\s+.*?(\d+)\s+passed/);
  record("test", r.code === 0,
    r.code === 0 ? `${m ? m[1] + " " : ""}tests passed` : lastLines(r.out, 14));
}

// --- lint: eslint — NON-BLOCKING backlog gate ------------------------------
// The repo had no linter; there is a known backlog. Report the counts so it's
// visible and can be ratcheted down, but never fail the run on it (yet).
if (wants("lint")) {
  const r = run("npx", ["eslint", "src", "-f", "json"], ROOT);
  let errors = 0, warnings = 0;
  try {
    const json = r.stdout.slice(r.stdout.indexOf("["), r.stdout.lastIndexOf("]") + 1);
    for (const f of JSON.parse(json)) { errors += f.errorCount; warnings += f.warningCount; }
    record("lint", errors === 0, `${errors} error(s), ${warnings} warning(s) [backlog — not enforced]`,
      { blocking: false });
  } catch {
    record("lint", false, "eslint did not produce parseable output", { blocking: false });
  }
}

// --- docs: ARCHITECTURE.md must be regenerated, not hand-edited ------------
// The generator embeds the HEAD commit hash + date in a header that churns
// every commit; only a change to the *content* (routes/nav/controllers) means
// the doc is genuinely stale. Ignore the header lines, and restore the file
// when only the header moved so we don't leave cosmetic churn behind.
if (wants("docs")) {
  const gen = run("node", ["scripts/update-architecture-docs.mjs"], ROOT);
  if (gen.code !== 0) {
    record("docs", false, lastLines(gen.out, 8));
  } else {
    const diff = run("git", ["diff", "-U0", "--", "docs/ARCHITECTURE.md"], ROOT);
    const headerLine = /^[+-](Last updated:|Source commit:|Source branch:)/;
    const changed = diff.out
      .split(/\r?\n/)
      .filter((l) => /^[+-][^+-]/.test(l) && !headerLine.test(l));
    const stale = changed.length > 0;
    if (!stale) run("git", ["checkout", "--", "docs/ARCHITECTURE.md"], ROOT);
    record("docs", !stale,
      stale ? "ARCHITECTURE.md content is stale — regenerated; stage it"
        : "ARCHITECTURE.md content up to date");
  }
}

// --- hygiene: no build/db/log/temp artifacts should be tracked -------------
if (wants("hygiene")) {
  const tracked = run("git", ["ls-files"], ROOT);
  const junk = /(\.db(-shm|-wal)?$|\.log$|^nul$|(^|\/)tempbuild\/|(^|\/)dist\/|\.tsbuildinfo$)/i;
  const bad = tracked.out.split(/\r?\n/).filter((f) => f && junk.test(f));
  record("hygiene", bad.length === 0,
    bad.length === 0 ? "no tracked build/db/log artifacts"
      : `${bad.length} tracked artifact(s): ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? " …" : ""}`);
}

// --- backendtest: dotnet test (opt-in; needs the API build output free) ----
// NOTE on Windows: if the API is running (dotnet run / the .exe), its locked
// build output blocks the rebuild — stop it first.
if (wants("backendtest")) {
  console.log(`${C.dim}running dotnet test…${C.reset}`);
  const testProj = path.join(ROOT, "server", "Commtrac.Api.Tests");
  const r = run("dotnet", ["test", "--nologo", "-clp:ErrorsOnly"], testProj);
  const m = r.out.match(/Passed!\s*-.*?Passed:\s*(\d+)(?:.*?Skipped:\s*(\d+))?/);
  record("backendtest", r.code === 0,
    r.code === 0
      ? `${m ? m[1] : "?"} passed${m && m[2] ? `, ${m[2]} skipped` : ""}`
      : lastLines(r.out, 14));
}

// --- e2e: Playwright smoke (opt-in; auto-starts the dev server) ------------
if (wants("e2e")) {
  console.log(`${C.dim}running Playwright e2e…${C.reset}`);
  const r = run("npm", ["run", "test:e2e"], ROOT);
  record("e2e", r.code === 0, r.code === 0 ? "e2e passed" : lastLines(r.out, 14));
}

function lastLines(s, n) {
  return s.trim().split(/\r?\n/).slice(-n).join("\n      ");
}

// Only BLOCKING gates affect the exit code; INFO gates (lint) are advisory.
const blockingFailed = results.filter((r) => r.blocking && !r.ok);
console.log("");
if (blockingFailed.length === 0) {
  console.log(`${C.green}All ${results.filter((r) => r.blocking).length} blocking gate(s) passed.${C.reset}`);
  process.exit(0);
} else {
  console.log(`${C.red}${blockingFailed.length} blocking gate(s) failed:${C.reset} ${blockingFailed.map((f) => f.name).join(", ")}`);
  process.exit(1);
}
