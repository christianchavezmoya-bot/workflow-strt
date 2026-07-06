import type { Scene, SceneView } from "./scenes";
import { SECTION_LABELS, VIEWS_PER_SCENE } from "./scenes";

function fallbackSrc(src: string): string {
  const id = src.match(/scenes\/(\d+)-/)?.[1] ?? "01";
  const fallbacks: Record<string, string> = {
    "01": "desktop-dashboard.png", "02": "desktop-work-instructions.png", "03": "desktop-projects.png",
    "04": "desktop-assets.png", "05": "desktop-work-instructions.png", "06": "desktop-dashboard.png",
    "07": "desktop-issues.png", "08": "desktop-documents.png", "09": "desktop-projects.png",
    "10": "desktop-assets.png", "11": "desktop-assets.png", "12": "desktop-work-instructions.png",
    "13": "desktop-work-instructions.png", "14": "desktop-issues.png", "15": "mobile-dashboard.png",
    "16": "desktop-work-instructions.png", "17": "mobile-dashboard.png", "18": "desktop-admin.png",
    "19": "desktop-admin.png", "20": "desktop-project-detail.png",
  };
  return `screenshots/${fallbacks[id] ?? "desktop-dashboard.png"}`;
}

function renderBullets(scene: Scene): string {
  if (!scene.bullets?.length) return "";
  return `<ul class="scene-bullets">${scene.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`;
}

function renderViewPanel(view: SceneView, index: number, allViews: SceneView[]): string {
  const variant = view.variant ?? "desktop";
  const fb = fallbackSrc(view.src);
  const active = index === 0 ? " is-active" : "";
  return `
    <button type="button" class="view-panel${active}" data-view-index="${index}" aria-label="${view.label}" aria-pressed="${index === 0}">
      <span class="view-panel-badge">${index + 1}</span>
      <span class="view-panel-label">${view.label}</span>
      <figure class="view-panel-frame view-panel-frame--${variant}">
        <img class="view-panel-img" src="${view.src}" alt="${view.label}" loading="eager" decoding="async"
             data-fallback="${fb}" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=''}" />
      </figure>
    </button>`;
}

function renderViewGrid(scene: Scene, compact = false): string {
  const panels = scene.views.slice(0, VIEWS_PER_SCENE).map((v, i) => renderViewPanel(v, i, scene.views)).join("");
  const dots = scene.views.slice(0, VIEWS_PER_SCENE).map((_, i) =>
    `<span class="view-dot${i === 0 ? " is-active" : ""}" data-view-dot="${i}"></span>`).join("");
  const gridCls = compact ? "view-grid view-grid--compact" : "view-grid";
  return `
    <div class="view-grid-wrap">
      <div class="${gridCls}">${panels}</div>
      <div class="view-grid-meta">
        <div class="view-dots">${dots}</div>
        <p class="view-hint">Click a panel · auto-advances with narration</p>
      </div>
    </div>`;
}

function renderArchitectureDiagram(): string {
  return `
    <div class="arch-diagram" aria-label="System architecture">
      <div class="arch-row arch-row--clients">
        <div class="arch-node">Web Browser</div>
        <div class="arch-node">Capacitor Android</div>
        <div class="arch-node">Capacitor iOS</div>
      </div>
      <div class="arch-connector">▼</div>
      <div class="arch-box arch-box--react">
        <strong>React App</strong>
        <span>features/ pages · services/ · repositories/ · Redux · IndexedDB</span>
      </div>
      <div class="arch-connector">▼ REST + SSE</div>
      <div class="arch-box arch-box--api">
        <strong>ASP.NET Core API</strong>
        <span>Flat controllers · EF Core + SQLite · JWT auth · port 4000</span>
      </div>
      <div class="arch-row arch-row--offline">
        <div class="arch-chip">Offline queue (native)</div>
        <div class="arch-chip">mediaStore photos</div>
        <div class="arch-chip">Biometric lock</div>
      </div>
    </div>`;
}

function renderJourneyStepper(scene: Scene): string {
  if (!scene.journeyStep) return "";
  const { current, total } = scene.journeyStep;
  const steps = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const cls = n < current ? "is-done" : n === current ? "is-active" : "";
    return `<span class="journey-step ${cls}" title="Step ${n}"><span>${n}</span></span>`;
  }).join("");
  return `
    <div class="journey-stepper" aria-label="User journey step ${current} of ${total}">
      <span class="journey-stepper-label">Live journey · Step ${current} of ${total}</span>
      <div class="journey-stepper-track">${steps}</div>
    </div>`;
}

function renderVisual(scene: Scene): string {
  const layout = scene.layout ?? "grid";

  if (layout === "architecture") {
    return `
      <div class="scene-visual-split">
        <div class="scene-info-panel">${renderArchitectureDiagram()}${renderBullets(scene)}</div>
        <div class="scene-visual scene-visual--app scene-visual--half">${renderViewGrid(scene, true)}</div>
      </div>`;
  }

  if (layout === "info" || layout === "journey") {
    return `
      <div class="scene-visual-split">
        <div class="scene-info-panel">
          ${layout === "journey" ? renderJourneyStepper(scene) : ""}
          ${renderBullets(scene)}
        </div>
        <div class="scene-visual scene-visual--app scene-visual--half">${renderViewGrid(scene, true)}</div>
      </div>`;
  }

  return `<div class="scene-visual scene-visual--app">${renderViewGrid(scene)}</div>`;
}

export function renderSceneContent(scene: Scene): string {
  const sectionLabel = SECTION_LABELS[scene.section] ?? scene.section;
  return `
    <div class="scene-inner scene-inner--${scene.layout ?? "grid"}" data-scene-id="${scene.id}" data-section="${scene.section}">
      <header class="scene-copy">
        <div class="scene-copy-tags">
          <span class="scene-section">${sectionLabel}</span>
          <span class="scene-tag">${scene.tag}</span>
        </div>
        <h2 class="scene-title">${scene.title}</h2>
        <p class="scene-subtitle">${scene.subtitle}</p>
      </header>
      ${renderVisual(scene)}
    </div>`;
}

export function renderOpening(): string {
  return `
    <section class="screen screen--opening" id="opening-screen">
      <div class="opening-bg"></div>
      <div class="opening-content">
        <div class="brand-mark">S</div>
        <p class="eyebrow">Customer Presentation · v4</p>
        <h1 class="opening-title">Strata Workflow App</h1>
        <p class="opening-lead">Product overview + live user journey — create a project, run a workflow, capture photos, log issues, and upload from phone.</p>
        <div class="opening-toc">
          <span>Welcome</span><span>Overview</span><span>8-step journey</span><span>Architecture</span>
        </div>
        <div class="opening-actions">
          <button type="button" class="btn btn-primary" id="btn-start">Start Presentation</button>
          <button type="button" class="btn btn-secondary" id="btn-start-muted">Start without audio</button>
          <button type="button" class="btn btn-secondary" id="btn-journey">Jump to User Journey</button>
        </div>
        <p class="opening-note"><strong>v4 · 20 scenes</strong> — If you see "1 / 13", delete this folder and download v4 from GitHub Releases.<br/>Use Start-Presentation.bat if the page is blank.</p>
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
        <p>Strata Workflow App connects office planners and field technicians — from project creation through workflow completion, photo capture, issue resolution, and signed deliverables.</p>
        <div class="end-actions">
          <button type="button" class="btn btn-primary" id="btn-replay">Replay Presentation</button>
          <button type="button" class="btn btn-secondary" id="btn-explore">Explore Scenes</button>
        </div>
      </div>
    </div>`;
}

export function setActiveView(index: number): void {
  document.querySelectorAll<HTMLElement>(".view-panel").forEach((el, i) => {
    el.classList.toggle("is-active", i === index);
    el.setAttribute("aria-pressed", String(i === index));
  });
  document.querySelectorAll<HTMLElement>(".view-dot").forEach((el, i) => {
    el.classList.toggle("is-active", i === index);
  });
}

export function updateTopbarSection(label: string): void {
  const el = document.getElementById("topbar-section");
  if (el) el.textContent = label;
}
