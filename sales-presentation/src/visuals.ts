import type { Scene, SceneVisual } from "./scenes";

function iconSvg(type: string): string {
  const icons: Record<string, string> = {
    hero: `<svg viewBox="0 0 120 120" class="viz-icon"><circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-width="3" opacity=".3"/><path d="M36 72 L60 36 L84 72 Z" fill="currentColor" opacity=".9"/><rect x="44" y="72" width="32" height="18" rx="3" fill="currentColor"/></svg>`,
    challenge: `<svg viewBox="0 0 120 120" class="viz-icon"><path d="M30 85 L45 55 L60 70 L75 40 L90 85 Z" fill="none" stroke="currentColor" stroke-width="3"/><line x1="25" y1="90" x2="95" y2="90" stroke="currentColor" stroke-width="3" opacity=".5"/></svg>`,
    platforms: `<svg viewBox="0 0 120 120" class="viz-icon"><rect x="12" y="28" width="42" height="30" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="66" y="38" width="28" height="48" rx="6" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="74" y="44" width="12" height="2" rx="1" fill="currentColor" opacity=".6"/></svg>`,
    projects: `<svg viewBox="0 0 120 120" class="viz-icon"><rect x="22" y="30" width="76" height="58" rx="6" fill="none" stroke="currentColor" stroke-width="2.5"/><line x1="22" y1="48" x2="98" y2="48" stroke="currentColor" stroke-width="2" opacity=".4"/><rect x="32" y="58" width="24" height="6" rx="2" fill="currentColor" opacity=".7"/><rect x="32" y="70" width="40" height="6" rx="2" fill="currentColor" opacity=".4"/></svg>`,
    assets: `<svg viewBox="0 0 120 120" class="viz-icon"><rect x="28" y="35" width="64" height="50" rx="5" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="60" cy="55" r="12" fill="currentColor" opacity=".25"/><path d="M48 78 L60 62 L72 78" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>`,
    workflow: `<svg viewBox="0 0 120 120" class="viz-icon"><circle cx="30" cy="60" r="10" fill="currentColor"/><circle cx="60" cy="60" r="10" fill="currentColor" opacity=".6"/><circle cx="90" cy="60" r="10" fill="currentColor" opacity=".3"/><line x1="40" y1="60" x2="50" y2="60" stroke="currentColor" stroke-width="2"/><line x1="70" y1="60" x2="80" y2="60" stroke="currentColor" stroke-width="2"/></svg>`,
    dashboard: `<svg viewBox="0 0 120 120" class="viz-icon"><rect x="20" y="25" width="35" height="30" rx="4" fill="currentColor" opacity=".5"/><rect x="65" y="25" width="35" height="30" rx="4" fill="currentColor" opacity=".35"/><rect x="20" y="65" width="80" height="30" rx="4" fill="currentColor" opacity=".2"/></svg>`,
    signatures: `<svg viewBox="0 0 120 120" class="viz-icon"><path d="M25 75 Q40 55 55 70 T85 60" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><line x1="25" y1="85" x2="95" y2="85" stroke="currentColor" stroke-width="2" opacity=".4"/></svg>`,
    documents: `<svg viewBox="0 0 120 120" class="viz-icon"><rect x="30" y="22" width="50" height="66" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"/><line x1="40" y1="40" x2="70" y2="40" stroke="currentColor" stroke-width="2" opacity=".5"/><line x1="40" y1="52" x2="65" y2="52" stroke="currentColor" stroke-width="2" opacity=".35"/><line x1="40" y1="64" x2="68" y2="64" stroke="currentColor" stroke-width="2" opacity=".35"/></svg>`,
    offline: `<svg viewBox="0 0 120 120" class="viz-icon"><circle cx="60" cy="55" r="28" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M38 38 L82 72" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M45 85 Q60 75 75 85" fill="none" stroke="currentColor" stroke-width="2" opacity=".5"/></svg>`,
    enterprise: `<svg viewBox="0 0 120 120" class="viz-icon"><path d="M60 25 L85 40 V75 L60 90 L35 75 V40 Z" fill="none" stroke="currentColor" stroke-width="2.5"/><polyline points="48,58 56,66 74,48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
    cta: `<svg viewBox="0 0 120 120" class="viz-icon"><circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M48 60 L58 70 L76 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  };
  return icons[type] ?? icons.hero;
}

function visualExtras(visual: SceneVisual): string {
  switch (visual) {
    case "hero":
      return `<div class="viz-orbit"><span></span><span></span><span></span></div>`;
    case "platforms":
      return `<div class="viz-labels"><span>Desktop</span><span>Mobile</span></div>`;
    case "workflow":
      return `<div class="viz-steps"><span>Capture</span><span>Verify</span><span>Sign off</span></div>`;
    case "offline":
      return `<div class="viz-sync-flow"><div class="sync-node online">Online</div><div class="sync-arrow">→</div><div class="sync-node offline">Offline queue</div></div>`;
    case "enterprise":
      return `<div class="viz-pills"><span>Permissions</span><span>Audit trail</span><span>Secure API</span></div>`;
    case "cta":
      return `<div class="viz-cta-contact"><span>strataworkflow.com</span><span>Schedule a demo</span></div>`;
    default:
      return "";
  }
}

export function renderSceneVisual(scene: Scene): string {
  return `
    <div class="scene-visual scene-visual--${scene.visual}" data-visual="${scene.visual}">
      <div class="viz-glow"></div>
      ${iconSvg(scene.visual)}
      ${visualExtras(scene.visual)}
      ${
        scene.hotspots
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
          : ""
      }
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
