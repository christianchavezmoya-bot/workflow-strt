#!/usr/bin/env node
/**
 * Generates MP3 narration — native English male, medium pace.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "public", "audio");
const force = process.argv.includes("--force");

const voice = "en-US-AndrewNeural";
const rate = "-2%";
const pitch = "+0Hz";

const scenes = [
  { id: "01", text: "Welcome to Strata Workflow App — field operations for telecom and utility project management. Technicians and project managers track projects, install assets, run guided workflows, capture photos and signatures, log issues, and produce reports — all in one place." },
  { id: "02", text: "One React bundle ships three ways. Desktop web uses React eighteen, TypeScript, and Material UI. The same bundle runs on Android and iOS through Capacitor eight. And a secure ASP.NET Core API with Entity Framework, SQLite, and JWT authentication powers it all on port four thousand." },
  { id: "03", text: "Projects are your top-level container. Each project holds assets, contacts, inspections, documents, and delivery profiles. Browse the projects list, open a detail page, and manage status and linked assets — on the desktop or in your pocket." },
  { id: "04", text: "The Assets workspace is where field work happens. Every asset has workflow assignments, live status from Not Started through Complete, documents, and run history. Expand an asset to see its workflow, then press Start Run." },
  { id: "05", text: "Guided workflows are the heart of on-site work. Step-by-step checklists capture photos and video, text, checkboxes, and QR inputs, plus time tracking, issues, and signatures. Blocking issues prevent completion, and PDF reports generate automatically." },
  { id: "06", text: "The operations dashboard gives managers office-scoped visibility. See open issues, pending signatures, technician workload, evidence completeness, and workflow health. Resume runs or upload missing photos with a single click." },
  { id: "07", text: "The Issues Board is a cross-project view of every asset issue. Track, assign, and resolve blocking and non-blocking problems in a kanban-style layout — so nothing falls through the cracks between projects or teams." },
  { id: "08", text: "Supporting modules keep teams equipped. A document library, work instructions, and tips for field staff. Admin for users and sites, settings with two-factor recovery, a QR mobile upload flow, and a feature-flagged bill-of-materials module." },
  { id: "09", text: "Now let's walk through a real user journey, on screen. Step one: create a project. Open Projects and click Create project. Enter the job number, customer, and site, choose the workflow mode, and save. Your new project is ready for assets." },
  { id: "10", text: "Step two: add assets. Open the Assets page and filter by your project. Register equipment with an asset tag, serial number, model, and location — then assign the workflow that applies to each asset." },
  { id: "11", text: "Step three: start the run. Find the asset, expand it, and click Start Run. Confirm the run workflow setup dialog, and WorkOrderRunner opens on the very first step — ready for guided field work." },
  { id: "12", text: "Step four: complete the steps. Each step shows clear instructions and capture fields. Tick the checkboxes, enter your readings, and scan QR codes. Time tracking runs in the background, and progress saves automatically." },
  { id: "13", text: "Step five: capture photos and video. On any step that requires media, tap the photo or video button and use the camera or gallery. Files attach to the run, and missing captures are flagged before you can complete." },
  { id: "14", text: "Step six: log an issue. Flag an issue on any step — blocking, observation, or scope deviation. Add a description, severity, and an optional photo. Blocking issues must be resolved before the run can complete." },
  { id: "15", text: "Step seven: add a photo from a phone. Generate a QR code from the dashboard or the runner, then scan it with any phone — no app install needed. The upload page sends the photo straight to the pending run." },
  { id: "16", text: "Step eight: complete and sign off. Review the summary — captures, issues, and time entries. Collect installer and customer signatures on the device or by email link. The run locks, a PDF report generates, and the dashboard updates." },
  { id: "17", text: "On mobile, Strata is offline-first. After login, the app prefetches projects, assets, workflow configs, assignments, and media into IndexedDB. Writes queue locally when disconnected, then sync on reconnect with conflict detection. Photos and signatures stay safe on device storage." },
  { id: "18", text: "Under the hood, the frontend layers features pages, services, repositories, and a Redux store. The backend exposes flat REST controllers with the project identifier as a query parameter. JWT authentication and a two-tier permission model protect every action, and native apps add a biometric lock." },
  { id: "19", text: "Strata is enterprise-ready — user management, brand settings, audit-ready records, and role-based access. Developers run the Vite dev server, the dotnet API with Swagger, and Playwright end-to-end tests. SQLite runs in write-ahead mode, with server-sent events for live updates across every connected client." },
  { id: "20", text: "Strata Workflow App connects your office and field teams — from creating a project through running workflows, capturing evidence, resolving issues, and signed deliverables. Ready to see it on your projects? Let's schedule a live walkthrough together." },
];

function findEdgeTts() {
  const candidates = ["edge-tts", join(process.env.HOME ?? "", ".local", "bin", "edge-tts")];
  for (const c of candidates) {
    try {
      execFileSync(c, ["--version"], { stdio: "ignore" });
      return c;
    } catch {
      /* next */
    }
  }
  throw new Error("edge-tts not found. Run: pip install edge-tts");
}

function normalizeMp3(mp3Path) {
  const tmp = mp3Path.replace(".mp3", ".norm.mp3");
  execFileSync(
    "ffmpeg",
    ["-y", "-i", mp3Path, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-qscale:a", "2", tmp],
    { stdio: "pipe" }
  );
  execFileSync("mv", [tmp, mp3Path]);
}

mkdirSync(outDir, { recursive: true });
const edgeTts = findEdgeTts();

for (const scene of scenes) {
  const mp3 = join(outDir, `scene-${scene.id}.mp3`);
  if (existsSync(mp3) && !force) {
    console.log(`skip scene-${scene.id}.mp3`);
    continue;
  }
  if (existsSync(mp3)) unlinkSync(mp3);
  const webm = join(outDir, `scene-${scene.id}.webm`);
  console.log(`generating scene-${scene.id}.mp3 (${voice}) ...`);
  const r = spawnSync(
    edgeTts,
    ["--voice", voice, `--rate=${rate}`, `--pitch=${pitch}`, "--text", scene.text, "--write-media", webm],
    { stdio: "inherit" }
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
  execFileSync("ffmpeg", ["-y", "-i", webm, "-codec:a", "libmp3lame", "-qscale:a", "2", mp3], { stdio: "inherit" });
  execFileSync("rm", [webm]);
  try {
    normalizeMp3(mp3);
  } catch {
    /* loudnorm optional */
  }
}

console.log("Done. Audio in public/audio/");
