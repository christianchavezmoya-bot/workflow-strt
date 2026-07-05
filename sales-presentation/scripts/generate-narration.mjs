#!/usr/bin/env node
/**
 * Generates MP3 narration files for each scene using edge-tts.
 * Requires: pip install edge-tts, ffmpeg on PATH
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "public", "audio");
const force = process.argv.includes("--force");

// Argentine female voice — natural conversational delivery (English script, Rioplatense accent)
const voice = "es-AR-ElenaNeural";
const rate = "-12%";
const pitch = "-1Hz";

const scenes = [
  {
    id: "01",
    text: "Welcome to Strata Workflow App. The field operations platform built for telecom and utility teams who need clarity, control, and confidence—from the office to the job site.",
  },
  {
    id: "02",
    text: "Field projects move fast. Paper checklists get lost. Photos sit on personal phones. Issues fall through the cracks. Strata Workflow App brings every project, asset, and action into one trusted system.",
  },
  {
    id: "03",
    text: "One application. Three ways to work. Desktop for planners and managers. The same experience on Android and iOS for technicians in the field. Everyone stays aligned.",
  },
  {
    id: "04",
    text: "Projects are your command center. Track status, contacts, inspections, and documents in one place. See what's on schedule—and what needs attention—at a glance.",
  },
  {
    id: "05",
    text: "The Assets workspace is where field work happens. Select a project, find your equipment, and launch the right workflow. Status, history, and documents travel with every asset.",
  },
  {
    id: "06",
    text: "Step-by-step workflows guide technicians through every task. Capture photos, record measurements, log time, raise issues, and collect signatures—all in a single guided run.",
  },
  {
    id: "07",
    text: "Blocking issues stop incomplete work before it becomes costly rework. The Issues Board and Dashboard give managers real-time visibility across projects and teams.",
  },
  {
    id: "08",
    text: "Collect on-device signatures or send secure links to customers. Generate professional reports and documentation automatically—evidence your stakeholders can trust.",
  },
  {
    id: "09",
    text: "Centralize project documents, work instructions, and tips for field staff. Your teams always have the right reference material—where and when they need it.",
  },
  {
    id: "10",
    text: "Strata Workflow App is built for real field conditions. On mobile, data syncs while connected—then technicians keep working offline. Photos, issues, and workflow progress queue safely until reconnect.",
  },
  {
    id: "11",
    text: "Role-based permissions protect sensitive data. Secure authentication, audit-ready records, and a modern API backend give IT teams confidence to deploy at scale.",
  },
  {
    id: "12",
    text: "Strata Workflow App turns fragmented field operations into a connected, accountable workflow—from first install to final sign-off. Ready to see it on your projects? Let's talk.",
  },
];

function findEdgeTts() {
  const candidates = [
    "edge-tts",
    join(process.env.HOME ?? "", ".local", "bin", "edge-tts"),
  ];
  for (const c of candidates) {
    try {
      execFileSync(c, ["--version"], { stdio: "ignore" });
      return c;
    } catch {
      /* try next */
    }
  }
  throw new Error("edge-tts not found. Run: pip install edge-tts");
}

mkdirSync(outDir, { recursive: true });
const edgeTts = findEdgeTts();

for (const scene of scenes) {
  const mp3 = join(outDir, `scene-${scene.id}.mp3`);
  if (existsSync(mp3) && !force) {
    console.log(`skip scene-${scene.id}.mp3 (exists; use --force to regenerate)`);
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
  execFileSync("ffmpeg", ["-y", "-i", webm, "-codec:a", "libmp3lame", "-qscale:a", "2", mp3], {
    stdio: "inherit",
  });
  execFileSync("rm", [webm]);
}

console.log("Done. Audio files in public/audio/");
