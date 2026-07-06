import { SCENES, SCENE_COUNT, FALLBACK_DURATIONS_MS, SECTION_LABELS, type Scene } from "./scenes";
import { narration } from "./audioEngine";
import "./styles.css";
import {
  renderOpening,
  renderPresentationShell,
  renderEndOverlay,
  renderSceneContent,
  updateTopbarSection,
} from "./visuals";

type StartMode = "audio" | "muted";

interface State {
  started: boolean;
  mode: StartMode;
  sceneIndex: number;
  playing: boolean;
  muted: boolean;
  ended: boolean;
  userPaused: boolean;
  playToken: number;
}

const state: State = {
  started: false,
  mode: "audio",
  sceneIndex: 0,
  playing: false,
  muted: false,
  ended: false,
  userPaused: false,
  playToken: 0,
};

const JOURNEY_INDEX = SCENES.findIndex((s) => s.section === "journey");

let advanceTimer: ReturnType<typeof setTimeout> | null = null;
let progressRaf = 0;
let touchStartX = 0;

const app = document.getElementById("app")!;

function clearAdvanceTimer(): void {
  if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
}

function mount(): void {
  app.innerHTML = renderOpening() + renderPresentationShell() + renderEndOverlay();
  bindOpening();
  buildSceneDots();
  bindControls();
  bindSwipe();
}

function hideEndOverlay(): void { document.getElementById("end-overlay")!.classList.remove("is-visible"); }
function showEndOverlay(): void { document.getElementById("end-overlay")!.classList.add("is-visible"); }

function bindOpening(): void {
  const startBtn = document.getElementById("btn-start") as HTMLButtonElement;
  const mutedBtn = document.getElementById("btn-start-muted") as HTMLButtonElement;
  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    startBtn.textContent = "Loading narration…";
    await start("audio");
    startBtn.disabled = false;
    startBtn.textContent = "Start Presentation";
  });
  mutedBtn.addEventListener("click", () => void start("muted"));
  document.getElementById("btn-journey")?.addEventListener("click", async () => {
    await start("audio");
    if (JOURNEY_INDEX >= 0) goToScene(JOURNEY_INDEX, true);
  });
}

async function start(mode: StartMode): Promise<void> {
  state.started = true;
  state.mode = mode;
  state.muted = mode === "muted";
  state.sceneIndex = 0;
  state.playing = true;
  state.ended = false;
  state.userPaused = false;
  state.playToken++;

  document.getElementById("opening-screen")!.hidden = true;
  document.getElementById("presentation-screen")!.hidden = false;
  document.getElementById("controls")!.hidden = false;
  hideEndOverlay();

  if (mode === "audio" && !state.muted) await narration.loadAll(SCENES);

  updateMuteButton();
  showScene(0, true);
}

function buildSceneDots(): void {
  const dots = document.getElementById("scene-dots")!;
  dots.innerHTML = SCENES.map(
    (_, i) => `<button type="button" class="scene-dot" data-index="${i}" aria-label="Scene ${i + 1}"></button>`
  ).join("");
  dots.querySelectorAll(".scene-dot").forEach((el) => {
    el.addEventListener("click", () => goToScene(Number((el as HTMLElement).dataset.index), true));
  });
}

function bindControls(): void {
  document.getElementById("btn-prev")!.addEventListener("click", () => goToScene(state.sceneIndex - 1, true));
  document.getElementById("btn-next")!.addEventListener("click", () => goToScene(state.sceneIndex + 1, true));
  document.getElementById("btn-play")!.addEventListener("click", togglePause);
  document.getElementById("btn-mute")!.addEventListener("click", toggleMute);
  document.getElementById("btn-restart")!.addEventListener("click", restart);
  document.getElementById("btn-replay")!.addEventListener("click", restart);
  document.getElementById("btn-explore")!.addEventListener("click", () => {
    state.ended = false; hideEndOverlay(); state.playing = false; updatePlayButton();
  });

  window.addEventListener("keydown", (e) => {
    if (!state.started) return;
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      if (state.ended) restart(); else goToScene(state.sceneIndex + 1, true);
    } else if (e.key === "ArrowLeft") goToScene(state.sceneIndex - 1, true);
    else if (e.key === "p" || e.key === "P") togglePause();
    else if (e.key === "m" || e.key === "M") toggleMute();
  });
}

function bindSwipe(): void {
  const stage = document.getElementById("stage")!;
  stage.addEventListener("touchstart", (e) => { touchStartX = e.changedTouches[0]?.clientX ?? 0; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (!state.started) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX;
    if (Math.abs(dx) < 50) return;
    goToScene(state.sceneIndex + (dx < 0 ? 1 : -1), true);
  }, { passive: true });
}

/** Clickable work-tree nodes jump to the matching journey scene. */
function bindSceneInteractions(): void {
  document.querySelectorAll<HTMLElement>(".wt-node").forEach((node) => {
    node.addEventListener("click", () => {
      const step = Number(node.dataset.journeyStep);
      const idx = SCENES.findIndex((s) => s.journeyStep === step);
      if (idx >= 0) goToScene(idx, true);
    });
  });
  // Architecture node click = subtle emphasis
  document.querySelectorAll<HTMLElement>(".arch-node, .arch-box").forEach((n) => {
    n.addEventListener("click", () => {
      document.querySelectorAll(".arch-node, .arch-box").forEach((x) => x.classList.remove("is-focus"));
      n.classList.add("is-focus");
    });
  });
}

function playSceneVideo(): void {
  const v = document.querySelector<HTMLVideoElement>(".shot-video");
  if (v) { v.currentTime = 0; v.play().catch(() => {}); }
}
function stopSceneVideo(): void {
  document.querySelectorAll<HTMLVideoElement>(".shot-video").forEach((v) => v.pause());
}

function currentScene(): Scene { return SCENES[state.sceneIndex]!; }

function goToScene(index: number, userInitiated = false): void {
  if (index < 0) return;
  if (index >= SCENE_COUNT) { finishPresentation(); return; }
  if (userInitiated) state.userPaused = !state.playing;
  showScene(index, userInitiated || state.playing);
}

function showScene(index: number, autoplay: boolean): void {
  clearAdvanceTimer();
  narration.stop();
  stopSceneVideo();
  cancelAnimationFrame(progressRaf);
  state.playToken++;

  state.sceneIndex = index;
  state.ended = false;
  hideEndOverlay();

  const scene = currentScene();
  const stage = document.getElementById("stage")!;
  stage.innerHTML = renderSceneContent(scene);
  bindSceneInteractions();

  updateDots();
  updateCounter();
  updateTopbarSection(SECTION_LABELS[scene.section] ?? "Sales Demonstration");
  setProgress(0);

  requestAnimationFrame(() => stage.querySelector(".scene-inner")?.classList.add("is-visible"));
  playSceneVideo();

  if (autoplay && state.playing && !state.userPaused) void playScene(scene, state.playToken);
}

async function playScene(scene: Scene, token: number): Promise<void> {
  clearAdvanceTimer();
  narration.stop();
  const duration = FALLBACK_DURATIONS_MS[scene.id] ?? 16000;
  const onDone = () => { if (token === state.playToken) scheduleAdvance(500); };

  if (state.mode === "audio" && !state.muted) {
    const el = await narration.play(scene.id);
    if (token !== state.playToken) return;
    if (el) {
      el.onended = onDone;
      el.onerror = () => animateProgressFor(duration, onDone, token);
      animateProgressFromAudio(el, token);
    } else {
      animateProgressFor(duration, onDone, token);
    }
  } else {
    animateProgressFor(duration, onDone, token);
  }
}

function animateProgressFromAudio(el: HTMLAudioElement, token: number): void {
  const tick = () => {
    if (token !== state.playToken) return;
    const d = el.duration;
    if (Number.isFinite(d) && d > 0) setProgress(el.currentTime / d);
    progressRaf = requestAnimationFrame(tick);
  };
  progressRaf = requestAnimationFrame(tick);
}

function animateProgressFor(ms: number, onComplete: () => void, token: number): void {
  const start = performance.now();
  const tick = (now: number) => {
    if (token !== state.playToken) return;
    if (!state.playing || state.userPaused) { progressRaf = requestAnimationFrame(tick); return; }
    const p = Math.min(1, (now - start) / ms);
    setProgress(p);
    if (p >= 1) onComplete(); else progressRaf = requestAnimationFrame(tick);
  };
  progressRaf = requestAnimationFrame(tick);
}

function scheduleAdvance(delayMs: number): void {
  clearAdvanceTimer();
  if (!state.playing || state.userPaused) return;
  advanceTimer = setTimeout(() => {
    if (state.sceneIndex >= SCENE_COUNT - 1) finishPresentation();
    else showScene(state.sceneIndex + 1, true);
  }, delayMs);
}

function finishPresentation(): void {
  state.ended = true; state.playing = false;
  clearAdvanceTimer(); narration.stop(); stopSceneVideo();
  setProgress(1); updatePlayButton(); showEndOverlay();
}

function restart(): void {
  state.ended = false; state.playing = true; state.userPaused = false;
  hideEndOverlay(); updatePlayButton(); showScene(0, true);
}

function togglePause(): void {
  if (state.ended) return;
  state.playing = !state.playing;
  state.userPaused = !state.playing;
  updatePlayButton();
  if (state.playing) {
    playSceneVideo();
    const el = narration.active;
    if (el && !state.muted) void el.play().catch(() => playScene(currentScene(), ++state.playToken));
    else void playScene(currentScene(), ++state.playToken);
  } else {
    clearAdvanceTimer(); narration.stop(); stopSceneVideo(); cancelAnimationFrame(progressRaf);
  }
}

function toggleMute(): void {
  if (state.mode === "muted") { state.mode = "audio"; state.muted = false; }
  else state.muted = !state.muted;
  updateMuteButton();
  if (state.muted) narration.stop();
  else if (state.playing && !state.userPaused) void playScene(currentScene(), ++state.playToken);
}

function updateMuteButton(): void {
  const btn = document.getElementById("btn-mute")!;
  const muted = state.mode === "muted" || state.muted;
  btn.textContent = muted ? "Unmute" : "Mute";
  btn.classList.toggle("is-muted", muted);
}

function updatePlayButton(): void {
  document.getElementById("btn-play")!.textContent = state.playing ? "❚❚" : "▶";
}

function updateDots(): void {
  document.querySelectorAll(".scene-dot").forEach((el, i) => {
    el.classList.toggle("is-active", i === state.sceneIndex);
    el.classList.toggle("is-done", i < state.sceneIndex);
  });
}

function updateCounter(): void {
  document.getElementById("scene-counter")!.textContent = `${state.sceneIndex + 1} / ${SCENE_COUNT}`;
}

function setProgress(ratio: number): void {
  document.getElementById("progress-fill")!.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
}

mount();
