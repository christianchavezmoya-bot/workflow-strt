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
  { id: "01", text: "Welcome to Strata Workflow App — field operations for telecom and utility project management. Technicians and project managers track projects, install assets, run workflows, capture photos and signatures, log issues, and produce reports. One React bundle ships on web, Android, and iOS, backed by a secure ASP.NET Core API." },
  { id: "02", text: "One React web bundle ships three ways. Desktop web uses React eighteen, TypeScript, Material UI, Vite, Redux, and React Router. Mobile wraps the same bundle in Capacitor eight for Android and iOS. The backend is ASP.NET Core eight with Entity Framework, SQLite, and JWT authentication on port four thousand." },
  { id: "03", text: "Projects are the top-level container. Each project holds assets, contacts, inspections, documents, and delivery profiles. Browse the projects list, open a detail page, and manage status, inspections, and linked assets from one command center." },
  { id: "04", text: "The Assets workspace at slash installations slash assets is where field work happens. Every asset has workflow assignments, status from Not Started through Complete, documents, and run history. Technicians select a project, find their equipment, and press Start Run." },
  { id: "05", text: "Guided workflows in WorkOrderRunner are the heart of on-site work. Step-by-step checklists capture photos and video, text and QR inputs, time tracking, issues, and signatures. Blocking issues prevent completion until resolved. PDF reports generate automatically." },
  { id: "06", text: "The operations dashboard gives managers office-scoped visibility. See open issues, pending signatures, technician workload, evidence completeness, and workflow health. Resume runs or upload missing photos with a single click." },
  { id: "07", text: "The Issues Board is a cross-project kanban-style view of asset issues. Track, assign, and resolve blocking and non-blocking problems so nothing falls through the cracks between projects or teams." },
  { id: "08", text: "Supporting modules include a document library, work instructions, tips for field staff, admin for users and sites, settings with two-factor recovery, and a standalone mobile upload flow at slash mobile-upload for QR-based photo upload from any phone." },
  { id: "09", text: "Let's walk through a live user journey. Step one: create a project. Open Projects and click Create project. Enter the job number, customer, site, and workflow mode. Save — your new project appears in the portfolio, ready for assets and field work." },
  { id: "10", text: "Step two: add assets and assign workflows. Open the Assets page and filter by your project. Register equipment with asset tag, serial, and location. Link workflow assignments so each asset knows which work instructions apply." },
  { id: "11", text: "Step three: start a run. The technician finds their asset and clicks Start Run. Confirm the workflow setup dialog, then WorkOrderRunner opens on the first step — ready for guided field work." },
  { id: "12", text: "Step four: complete workflow steps. Each step shows instructions, reference media, and capture fields. Check boxes, enter readings, scan QR codes, and navigate forward. Progress saves automatically as the technician works." },
  { id: "13", text: "Step five: capture photos and video. On any step that requires media, tap the photo or video button. Use the device camera or gallery. Attached files stay with the run, and missing captures are flagged before completion." },
  { id: "14", text: "Step six: log an issue. Flag an issue on any step — blocking, observation, or scope deviation. Add a description, severity, and optional photo. Blocking issues must be resolved before the run can complete — the server returns four twenty-two if they are not." },
  { id: "15", text: "Step seven: add a photo from a phone. Generate a QR code from the dashboard or workflow runner. The technician scans it with their phone camera — no app install needed. The upload page at slash mobile-upload sends the photo directly to the pending run." },
  { id: "16", text: "Step eight: complete and sign off. Review the run summary — captures, issues, and time entries. Collect installer and customer signatures on-device or via email link. The run locks, a PDF report generates, and the dashboard updates." },
  { id: "17", text: "On mobile, Strata is offline-first. After login, the app prefetches projects, assets, workflow configs, assignments, and media into IndexedDB. Writes queue locally when disconnected, then sync on reconnect with conflict detection. Photos stay safe on device storage." },
  { id: "18", text: "Under the hood, the frontend layers features pages, services, repositories, and a Redux store. The backend exposes flat REST controllers with project identifiers as query parameters. JWT authentication and a two-tier permission model protect every action. Native apps add biometric lock and secure token storage." },
  { id: "19", text: "Enterprise-ready with user management, brand settings, audit records, and role-based access. Developers run npm run dev on port fifty-one seventy-three, dotnet run for the API on port four thousand with Swagger, and Playwright end-to-end tests. SQLite runs in WAL mode with server-sent events for live updates." },
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
