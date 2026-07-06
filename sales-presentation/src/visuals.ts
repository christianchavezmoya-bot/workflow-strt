import type { Scene } from "./scenes";

function fallbackSrc(src: string, alt?: string): string {
  if (src.includes("workflow-runner")) return src.replace("workflow-runner", "assets");
  if (src.includes("project-detail")) return src.replace("project-detail", "projects");
  return alt ?? src;
}

function renderScreenshotFrame(src: string, label: string, variant: "desktop" | "phone"): string {
  const cls = variant === "phone" ? "app-shot app-shot--phone" : "app-shot app-shot--desktop";
  const fb = fallbackSrc(src);
  return `
    <figure class="${cls}">
      <div class="app-shot-chrome">
        <span class="app-shot-dot"></span><span class="app-shot-dot"></span><span class="app-shot-dot"></span>
        <span class="app-shot-label">${label}</span>
      </div>
      <div class="app-shot-body">
        <img class="app-shot-img" src="${src}" alt="${label}" loading="eager" decoding="async"
             onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=''}"
             data-fallback="${fb}" />
      </div>
    </figure>`;
}

function renderScreens(scene: Scene): string {
  const screens = scene.screens;
  if (!screens?.primary) {
    return `<div class="app-preview app-preview--empty"><p>Live app preview</p></div>`;
  }

  if (screens.layout === "split-platforms" && screens.secondary) {
    return `
      <div class="app-preview app-preview--split">
        ${renderScreenshotFrame(screens.primary, "Desktop web", "desktop")}
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

function renderBullets(scene: Scene): string {
  if (!scene.bullets?.length) return "";
  return `
    <ul class="scene-bullets">
      ${scene.bullets.map((b) => `<li>${b.text}</li>`).join("")}
    </ul>`;
}

export function renderSceneContent(scene: Scene): string {
  return `
    <div class="scene-inner" data-scene-id="${scene.id}">
      <header class="scene-copy">
        <span class="scene-tag">${scene.tag}</span>
        <h2 class="scene-title">${scene.title}</h2>
        <p class="scene-subtitle">${scene.subtitle}</p>
        ${renderBullets(scene)}
      </header>
      <div class="scene-visual scene-visual--app" data-visual="${scene.id}">
        ${renderScreens(scene)}
      </div>
    </div>`;
}

export function renderOpening(): string {
  return `
    <section class="screen screen--opening" id="opening-screen">
      <div class="opening-bg"></div>
      <div class="opening-content">
        <div class="brand-mark">S</div>
        <p class="eyebrow">Customer Presentation · v2</p>
        <h1 class="opening-title">Strata Workflow App</h1>
        <p class="opening-lead">Field operations for telecom &amp; utility teams — projects, assets, workflows, and reports in one platform.</p>
        <div class="opening-actions">
          <button type="button" class="btn btn-primary" id="btn-start">Start Presentation</button>
          <button type="button" class="btn btn-secondary" id="btn-start-muted">Start without audio</button>
        </div>
        <p class="opening-note">Narration uses a professional male English voice at natural pace.<br/>Best in full screen · use Start-Presentation.bat if the page is blank.</p>
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
