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

// Native English male, neutral business tone — medium natural pace
const voice = "en-US-AndrewNeural";
const rate = "-2%";
const pitch = "+0Hz";

const scenes = [
  {
    id: "01",
    text: "Welcome to Strata Workflow App. A field-operations platform for telecom and utility project management. Track projects, install assets on site, run workflows, capture photos and signatures, log issues, and produce reports — all in one place.",
  },
  {
    id: "02",
    text: "Technicians and project managers use Strata every day. Install and inspect assets with guided work instructions. Replace lost checklists, scattered photos, and spreadsheets with one trusted system your teams can rely on.",
  },
  {
    id: "03",
    text: "One React web bundle ships three ways. Desktop web for planners — built with React, TypeScript, and Material UI. The same experience on Android and iOS through Capacitor. And a secure ASP.NET Core API with SQLite and JWT authentication.",
  },
  {
    id: "04",
    text: "Projects are your top-level container. Each project holds assets, contacts, inspections, documents, and delivery profiles. Browse the projects list, open a detail page, and manage status, inspections, and linked assets from one command center.",
  },
  {
    id: "05",
    text: "The Assets workspace is where field work happens. Every project asset has workflow assignments, live status from Not Started through Complete, documents, and run history. Technicians select a project, find their equipment, and press Start Run.",
  },
  {
    id: "06",
    text: "Guided workflows are the heart of on-site work. Step-by-step checklists capture photos and video, text and QR inputs, productive and downtime hours, issues, and signatures. Blocking issues prevent completion until they are resolved. Reports generate automatically.",
  },
  {
    id: "07",
    text: "The operations dashboard gives managers office-scoped visibility. See open issues, pending signatures, technician workload, evidence completeness, and workflow health. Resume runs or upload missing photos with a single click.",
  },
  {
    id: "08",
    text: "The Issues Board is a cross-project view of every asset issue. Track, assign, and resolve blocking and non-blocking problems in a kanban-style layout — so nothing falls through the cracks between projects or teams.",
  },
  {
    id: "09",
    text: "Supporting modules keep teams equipped. A document library for project and asset files. Work instructions and tips for field staff. Admin for users and sites. Settings, profile, two-factor recovery, and a standalone mobile upload flow.",
  },
  {
    id: "10",
    text: "On mobile, Strata is offline-first. After login, the app prefetches projects, assets, workflow configs, assignments, and config media. Writes queue locally when disconnected, then sync on reconnect with conflict detection. Photos and signatures stay safe on device storage.",
  },
  {
    id: "11",
    text: "Under the hood, the frontend layers pages, services, repositories, and a Redux store. The backend exposes flat REST controllers with project identifiers as query parameters. JWT authentication and a two-tier permission model protect every action. Native apps add biometric lock and secure token storage.",
  },
  {
    id: "12",
    text: "Enterprise features include user management, brand settings, audit-ready records, and role-based access. The API runs on ASP.NET Core with Entity Framework migrations, SQLite in WAL mode, and server-sent events for live updates across connected clients.",
  },
  {
    id: "13",
    text: "Strata Workflow App connects your office and field teams — from project planning through signed deliverables. Ready to see it on your projects? Let's schedule a conversation and walk through your workflows together.",
  },
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

// Remove stale scene-12+ if we had old 12-scene deck only — keep scene-13
console.log("Done. Audio in public/audio/");
