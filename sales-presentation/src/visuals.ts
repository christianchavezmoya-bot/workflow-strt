import type { Scene, Shot } from "./scenes";
import { JOURNEY_STEPS, SECTION_LABELS } from "./scenes";

/* ── Screenshot frames ── */

function frame(shot: Shot, extraClass = ""): string {
  const variant = shot.variant ?? "desktop";
  return `
    <figure class="shot shot--${variant} ${extraClass}">
      <div class="shot-chrome">
        <span class="shot-dot"></span><span class="shot-dot"></span><span class="shot-dot"></span>
        <span class="shot-label">${shot.label}</span>
      </div>
      <div class="shot-body">
        <img class="shot-img" src="${shot.src}" alt="${shot.label}" loading="eager" decoding="async" />
      </div>
    </figure>`;
}

function heroVisual(scene: Scene): string {
  const shot = scene.shots?.[0];
  if (!shot) return "";
  return `<div class="visual visual--hero">${frame(shot, "shot--hero")}</div>`;
}

function compareVisual(scene: Scene): string {
  const shots = scene.shots ?? [];
  return `<div class="visual visual--compare">${shots.map((s) => frame(s)).join("")}</div>`;
}

function gridVisual(scene: Scene): string {
  const shots = scene.shots ?? [];
  return `<div class="visual visual--grid">${shots.slice(0, 4).map((s) => frame(s)).join("")}</div>`;
}

function videoVisual(scene: Scene): string {
  if (!scene.video) return heroVisual(scene);
  const variant = scene.videoVariant ?? "desktop";
  return `
    <div class="visual visual--video visual--video-${variant}">
      <figure class="shot shot--${variant} shot--video">
        <div class="shot-chrome">
          <span class="shot-dot"></span><span class="shot-dot"></span><span class="shot-dot"></span>
          <span class="shot-label">Live screen recording</span>
        </div>
        <div class="shot-body">
          <video class="shot-video" src="${scene.video}" muted playsinline preload="auto" loop></video>
        </div>
      </figure>
    </div>`;
}

/* ── Diagrams ── */

export function architectureDiagram(compact = false): string {
  const cls = compact ? "arch arch--compact" : "arch";
  return `
    <div class="${cls}" aria-label="System architecture">
      <div class="arch-tier arch-tier--clients">
        <button class="arch-node" data-arch="web" type="button">🖥️ Web Browser<span>React SPA</span></button>
        <button class="arch-node" data-arch="android" type="button">🤖 Android<span>Capacitor 8</span></button>
        <button class="arch-node" data-arch="ios" type="button">📱 iOS<span>Capacitor 8</span></button>
      </div>
      <div class="arch-flow">▼</div>
      <button class="arch-box arch-box--react" data-arch="react" type="button">
        <strong>React App</strong>
        <span>features/ → services/ → repositories/ → Redux</span>
        <span class="arch-sub">IndexedDB + Filesystem (native offline)</span>
      </button>
      <div class="arch-flow">▼ &nbsp;REST + SSE&nbsp; ▲</div>
      <button class="arch-box arch-box--api" data-arch="api" type="button">
        <strong>ASP.NET Core API</strong>
        <span>Flat controllers · EF Core + SQLite (WAL) · JWT :4000</span>
      </button>
      <div class="arch-tier arch-tier--offline">
        <span class="arch-chip">useSyncEngine → queue</span>
        <span class="arch-chip">mediaStore photos</span>
        <span class="arch-chip">409/412 conflict resolve</span>
        <span class="arch-chip">biometric lock</span>
      </div>
    </div>`;
}

export function workTree(activeStep?: number): string {
  const nodes = JOURNEY_STEPS.map((label, i) => {
    const n = i + 1;
    const state = activeStep == null ? "" : n < activeStep ? "is-done" : n === activeStep ? "is-active" : "is-pending";
    return `
      <button class="wt-node ${state}" data-journey-step="${n}" type="button" title="Step ${n}: ${label}">
        <span class="wt-num">${n}</span>
        <span class="wt-label">${label}</span>
      </button>`;
  }).join(`<span class="wt-link"></span>`);
  return `<div class="work-tree" aria-label="User journey work tree">${nodes}</div>`;
}

/* ── Scene assembly ── */

function bullets(scene: Scene): string {
  if (!scene.bullets?.length) return "";
  return `<ul class="scene-bullets">${scene.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`;
}

function visualForLayout(scene: Scene): string {
  switch (scene.layout) {
    case "architecture": return `<div class="visual visual--arch">${architectureDiagram(false)}</div>`;
    case "compare": return compareVisual(scene);
    case "grid": return gridVisual(scene);
    case "video": return videoVisual(scene);
    case "journey": return heroVisual(scene);
    case "hero":
    default: return heroVisual(scene);
  }
}

export function renderSceneContent(scene: Scene): string {
  const section = SECTION_LABELS[scene.section] ?? scene.section;
  const isJourney = scene.section === "journey";
  const leftPanel = `
    <div class="scene-left">
      ${bullets(scene)}
      ${isJourney ? workTree(scene.journeyStep) : ""}
    </div>`;
  const visual = visualForLayout(scene);

  return `
    <div class="scene-inner scene-inner--${scene.layout}" data-scene-id="${scene.id}" data-section="${scene.section}">
      <header class="scene-copy">
        <div class="scene-copy-tags">
          <span class="scene-section">${section}</span>
          <span class="scene-tag">${scene.tag}</span>
        </div>
        <h2 class="scene-title">${scene.title}</h2>
        <p class="scene-subtitle">${scene.subtitle}</p>
      </header>
      <div class="scene-body">
        ${leftPanel}
        <div class="scene-right">${visual}</div>
      </div>
    </div>`;
}

export function renderOpening(): string {
  return `
    <section class="screen screen--opening" id="opening-screen">
      <div class="opening-bg"></div>
      <div class="opening-content">
        <div class="brand-mark">S</div>
        <p class="eyebrow">Customer Presentation · v5</p>
        <h1 class="opening-title">Strata Workflow App</h1>
        <p class="opening-lead">Product overview + a live, recorded user journey — create a project, run a workflow, capture photos, log issues, and upload from a phone.</p>
        <div class="opening-toc">
          <span>Overview</span><span>8-step journey videos</span><span>Architecture</span>
        </div>
        <div class="opening-actions">
          <button type="button" class="btn btn-primary" id="btn-start">Start Presentation</button>
          <button type="button" class="btn btn-secondary" id="btn-journey">Watch User Journey</button>
          <button type="button" class="btn btn-secondary" id="btn-start-muted">Silent mode</button>
        </div>
        <p class="opening-note"><strong>v5 · 20 scenes with video</strong> — if you see "1 / 13", delete the old folder and download v5.<br/>Use Start-Presentation.bat if the page is blank.</p>
      </div>
    </section>`;
}

export function renderControls(): string {
  return `
    <footer class="controls" id="controls" hidden>
      <div class="controls-left">
        <button type="button" class="ctrl-btn" id="btn-prev" aria-label="Previous scene">←</button>
        <button type="button" class="ctrl-btn" id="btn-play" aria-label="Pause presentation">❚❚</button>
        <button type="button" class="ctrl-btn" id="btn-next" aria-label="Next scene">→</button>
      </div>
      <div class="controls-center">
        <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
        <div class="scene-dots" id="scene-dots"></div>
      </div>
      <div class="controls-right">
        <span class="scene-counter" id="scene-counter">1 / 20</span>
        <button type="button" class="ctrl-btn ctrl-btn--text" id="btn-mute" aria-label="Mute narration">Mute</button>
        <button type="button" class="ctrl-btn ctrl-btn--text" id="btn-restart" aria-label="Restart">Restart</button>
      </div>
    </footer>`;
}

export function renderPresentationShell(): string {
  return `
    <section class="screen screen--presentation" id="presentation-screen" hidden>
      <header class="topbar">
        <div class="topbar-brand"><span class="brand-dot"></span> Strata Workflow App</div>
        <div class="topbar-meta" id="topbar-section">Sales Demonstration</div>
      </header>
      <main class="stage" id="stage"></main>
      ${renderControls()}
    </section>`;
}

export function renderEndOverlay(): string {
  return `
    <div class="end-overlay" id="end-overlay">
      <div class="end-card">
        <h3>Thank you</h3>
        <p>Strata Workflow App connects office planners and field technicians — from creating a project through running workflows, capturing evidence, resolving issues, and signed deliverables.</p>
        <div class="end-actions">
          <button type="button" class="btn btn-primary" id="btn-replay">Replay Presentation</button>
          <button type="button" class="btn btn-secondary" id="btn-explore">Explore Scenes</button>
        </div>
      </div>
    </div>`;
}

export function updateTopbarSection(label: string): void {
  const el = document.getElementById("topbar-section");
  if (el) el.textContent = label;
}
