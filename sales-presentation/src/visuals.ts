import type { Scene, SceneVisual } from "./scenes";

function fallbackImage(primary: string, secondary?: string): string {
  return secondary ?? primary.replace("workflow-runner", "assets").replace("desktop-workflow-runner", "desktop-assets");
}

function renderScreenshotFrame(src: string, label: string, variant: "desktop" | "phone"): string {
  const cls = variant === "phone" ? "app-shot app-shot--phone" : "app-shot app-shot--desktop";
  return `
    <figure class="${cls}">
      <div class="app-shot-chrome">
        <span class="app-shot-dot"></span><span class="app-shot-dot"></span><span class="app-shot-dot"></span>
        <span class="app-shot-label">${label}</span>
      </div>
      <img class="app-shot-img" src="${src}" alt="${label}" loading="eager" decoding="async"
           onerror="this.dataset.fallback&&(this.src=this.dataset.fallback)"
           data-fallback="${fallbackImage(src)}" />
    </figure>`;
}

function renderScreens(scene: Scene): string {
  const screens = scene.screens;
  if (!screens?.primary) return renderLegacyVisual(scene);

  if (screens.layout === "split-platforms" && screens.secondary) {
    return `
      <div class="app-preview app-preview--split">
        ${renderScreenshotFrame(screens.primary, "Desktop web app", "desktop")}
        ${renderScreenshotFrame(screens.secondary, "Mobile app", "phone")}
      </div>`;
  }

  if (screens.layout === "phone") {
    return `
      <div class="app-preview app-preview--phone-center">
        ${renderScreenshotFrame(screens.primary, "Mobile field app", "phone")}
      </div>`;
  }

  return `
    <div class="app-preview app-preview--desktop">
      ${renderScreenshotFrame(screens.primary, "Strata Workflow App", "desktop")}
    </div>`;
}

function iconSvg(type: string): string {
  const icons: Record<string, string> = {
    hero: `<svg viewBox="0 0 120 120" class="viz-icon viz-icon--fallback"><circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-width="3" opacity=".3"/><path d="M36 72 L60 36 L84 72 Z" fill="currentColor" opacity=".9"/></svg>`,
    cta: `<svg viewBox="0 0 120 120" class="viz-icon viz-icon--fallback"><circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M48 60 L58 70 L76 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`,
  };
  return icons[type] ?? icons.hero;
}

function renderLegacyVisual(scene: Scene): string {
  return `
    <div class="scene-visual scene-visual--${scene.visual}" data-visual="${scene.visual}">
      <div class="viz-glow"></div>
      ${iconSvg(scene.visual)}
    </div>`;
}

export function renderSceneVisual(scene: Scene): string {
  const hotspots = scene.hotspots
    ? `<div class="hotspots">${scene.hotspots
        .map(
          (h) => `
          <button type="button" class="hotspot" style="left:${h.x}%;top:${h.y}%" data-hotspot="${h.id}" aria-label="${h.label}">
            <span class="hotspot-dot"></span>
            <span class="hotspot-card">
              <strong>${h.label}</strong>
              <em>${h.detail}</em>
            </span>
          </button>`
        )
        .join("")}</div>`
    : "";

  return `
    <div class="scene-visual scene-visual--${scene.visual} scene-visual--app" data-visual="${scene.visual}">
      ${renderScreens(scene)}
      ${hotspots}
    </div>`;
}

export function renderSceneContent(scene: Scene): string {
  return `
    <div class="scene-inner" data-scene-id="${scene.id}">
      <div class="scene-copy">
        <span class="scene-tag">${scene.tag}</span>
        <h2 class="scene-title">${scene.title}</h2>
        <p class="scene-subtitle">${scene.subtitle}</p>
      </div>
      ${renderSceneVisual(scene)}
    </div>`;
}

export function renderOpening(): string {
  return `
    <section class="screen screen--opening" id="opening-screen">
      <div class="opening-bg"></div>
      <div class="opening-content">
        <div class="brand-mark">S</div>
        <p class="eyebrow">Customer Presentation</p>
        <h1 class="opening-title">Strata Workflow App</h1>
        <p class="opening-lead">Field operations platform for telecom &amp; utility teams</p>
        <div class="opening-actions">
          <button type="button" class="btn btn-primary" id="btn-start">Start Presentation</button>
          <button type="button" class="btn btn-secondary" id="btn-start-muted">Start without audio</button>
        </div>
        <p class="opening-note">Tap Start to enable narration and automatic scene progression.<br/>Best experienced in full screen.</p>
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
        <span class="scene-counter" id="scene-counter">1 / 12</span>
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
        <p>Strata Workflow App connects your office and field teams—from project planning to signed deliverables.</p>
        <div class="end-actions">
          <button type="button" class="btn btn-primary" id="btn-replay">Replay Presentation</button>
          <button type="button" class="btn btn-secondary" id="btn-explore">Explore Scenes</button>
        </div>
      </div>
    </div>`;
}
