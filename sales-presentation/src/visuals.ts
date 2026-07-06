import type { Scene, SceneView } from "./scenes";
import { VIEWS_PER_SCENE } from "./scenes";

function fallbackSrc(src: string, views: SceneView[]): string {
  const base = src.replace(/scenes\/(\d+)-v\d+\.png/, (_, id) => {
    const fallbacks: Record<string, string> = {
      "01": "desktop-dashboard.png",
      "02": "desktop-assets.png",
      "03": "desktop-work-instructions.png",
      "04": "desktop-projects.png",
      "05": "desktop-assets.png",
      "06": "desktop-work-instructions.png",
      "07": "desktop-dashboard.png",
      "08": "desktop-issues.png",
      "09": "desktop-documents.png",
      "10": "mobile-dashboard.png",
      "11": "desktop-admin.png",
      "12": "desktop-admin.png",
      "13": "desktop-project-detail.png",
    };
    return fallbacks[id] ?? "desktop-dashboard.png";
  });
  return `screenshots/${base.replace("screenshots/", "")}`;
}

function renderViewPanel(view: SceneView, index: number, sceneId: number, allViews: SceneView[]): string {
  const variant = view.variant ?? "desktop";
  const fb = fallbackSrc(view.src, allViews);
  const active = index === 0 ? " is-active" : "";
  return `
    <button type="button" class="view-panel${active}" data-view-index="${index}" aria-label="${view.label}" aria-pressed="${index === 0}">
      <span class="view-panel-badge">${index + 1}</span>
      <span class="view-panel-label">${view.label}</span>
      <figure class="view-panel-frame view-panel-frame--${variant}">
        <img
          class="view-panel-img"
          src="${view.src}"
          alt="${view.label}"
          loading="eager"
          decoding="async"
          data-fallback="${fb}"
          onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=''}"
        />
      </figure>
    </button>`;
}

function renderViewGrid(scene: Scene): string {
  const panels = scene.views
    .slice(0, VIEWS_PER_SCENE)
    .map((v, i) => renderViewPanel(v, i, scene.id, scene.views))
    .join("");

  const dots = scene.views
    .slice(0, VIEWS_PER_SCENE)
    .map((_, i) => `<span class="view-dot${i === 0 ? " is-active" : ""}" data-view-dot="${i}"></span>`)
    .join("");

  return `
    <div class="view-grid-wrap" data-scene-id="${scene.id}">
      <div class="view-grid" id="view-grid">
        ${panels}
      </div>
      <div class="view-grid-meta">
        <div class="view-dots" id="view-dots">${dots}</div>
        <p class="view-hint">Click a panel to focus · views auto-advance with narration</p>
      </div>
    </div>`;
}

export function renderSceneContent(scene: Scene): string {
  return `
    <div class="scene-inner" data-scene-id="${scene.id}">
      <header class="scene-copy">
        <span class="scene-tag">${scene.tag}</span>
        <h2 class="scene-title">${scene.title}</h2>
        <p class="scene-subtitle">${scene.subtitle}</p>
      </header>
      <div class="scene-visual scene-visual--app" data-visual="${scene.id}">
        ${renderViewGrid(scene)}
      </div>
    </div>`;
}

export function renderOpening(): string {
  return `
    <section class="screen screen--opening" id="opening-screen">
      <div class="opening-bg"></div>
      <div class="opening-content">
        <div class="brand-mark">S</div>
        <p class="eyebrow">Customer Presentation · v3</p>
        <h1 class="opening-title">Strata Workflow App</h1>
        <p class="opening-lead">Field operations for telecom &amp; utility teams — projects, assets, workflows, and reports in one platform.</p>
        <div class="opening-actions">
          <button type="button" class="btn btn-primary" id="btn-start">Start Presentation</button>
          <button type="button" class="btn btn-secondary" id="btn-start-muted">Start without audio</button>
        </div>
        <p class="opening-note">Each scene shows four live app views matched to the narration.<br/>Best in full screen · use Start-Presentation.bat if the page is blank.</p>
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
        <span class="scene-counter" id="scene-counter">1 / 13</span>
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
        <div class="topbar-meta">Sales Demonstration</div>
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
        <p>Strata Workflow App connects office planners and field technicians — from project setup through signed deliverables and audit-ready reports.</p>
        <div class="end-actions">
          <button type="button" class="btn btn-primary" id="btn-replay">Replay Presentation</button>
          <button type="button" class="btn btn-secondary" id="btn-explore">Explore Scenes</button>
        </div>
      </div>
    </div>`;
}

export function setActiveView(index: number): void {
  const panels = document.querySelectorAll<HTMLElement>(".view-panel");
  panels.forEach((el, i) => {
    const active = i === index;
    el.classList.toggle("is-active", active);
    el.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll<HTMLElement>(".view-dot").forEach((el, i) => {
    el.classList.toggle("is-active", i === index);
  });
}
