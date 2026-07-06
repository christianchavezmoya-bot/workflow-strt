import { SCENES, SCENE_COUNT, FALLBACK_DURATIONS_MS, VIEWS_PER_SCENE, type Scene } from "./scenes";
import { narration } from "./audioEngine";
import "./styles.css";
import {
  renderOpening,
  renderPresentationShell,
  renderEndOverlay,
  renderSceneContent,
  setActiveView,
} from "./visuals";

type StartMode = "audio" | "muted";

interface State {
  started: boolean;
  mode: StartMode;
  sceneIndex: number;
  viewIndex: number;
  playing: boolean;
  muted: boolean;
  ended: boolean;
  userPaused: boolean;
  playToken: number;
  userPinnedView: boolean;
}

const state: State = {
  started: false,
  mode: "audio",
  sceneIndex: 0,
  viewIndex: 0,
  playing: false,
  muted: false,
  ended: false,
  userPaused: false,
  playToken: 0,
  userPinnedView: false,
};

let advanceTimer: ReturnType<typeof setTimeout> | null = null;
let viewCycleTimer: ReturnType<typeof setInterval> | null = null;
let progressRaf = 0;
let touchStartX = 0;

const app = document.getElementById("app")!;

function clearAdvanceTimer(): void {
  if (advanceTimer) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }
}

function clearViewCycleTimer(): void {
  if (viewCycleTimer) {
    clearInterval(viewCycleTimer);
    viewCycleTimer = null;
  }
}

function mount(): void {
  app.innerHTML = renderOpening() + renderPresentationShell() + renderEndOverlay();
  bindOpening();
  buildSceneDots();
  bindControls();
  bindSwipe();
}

function hideEndOverlay(): void {
  document.getElementById("end-overlay")!.classList.remove("is-visible");
}

function showEndOverlay(): void {
  document.getElementById("end-overlay")!.classList.add("is-visible");
}

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
}

async function start(mode: StartMode): Promise<void> {
  state.started = true;
  state.mode = mode;
  state.muted = mode === "muted";
  state.sceneIndex = 0;
  state.viewIndex = 0;
  state.playing = true;
  state.ended = false;
  state.userPaused = false;
  state.userPinnedView = false;
  state.playToken++;

  document.getElementById("opening-screen")!.hidden = true;
  document.getElementById("presentation-screen")!.hidden = false;
  document.getElementById("controls")!.hidden = false;
  hideEndOverlay();

  if (mode === "audio" && !state.muted) {
    await narration.loadAll(SCENES);
  }

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
    state.ended = false;
    hideEndOverlay();
    state.playing = false;
    updatePlayButton();
  });

  window.addEventListener("keydown", (e) => {
    if (!state.started) return;
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      if (state.ended) restart();
      else goToScene(state.sceneIndex + 1, true);
    } else if (e.key === "ArrowLeft") goToScene(state.sceneIndex - 1, true);
    else if (e.key === "ArrowDown") cycleView(1, true);
    else if (e.key === "ArrowUp") cycleView(-1, true);
    else if (e.key === "p" || e.key === "P") togglePause();
    else if (e.key === "m" || e.key === "M") toggleMute();
  });
}

function bindSwipe(): void {
  document.getElementById("stage")!.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0]?.clientX ?? 0;
  }, { passive: true });
  document.getElementById("stage")!.addEventListener("touchend", (e) => {
    if (!state.started) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX;
    if (Math.abs(dx) < 50) return;
    goToScene(state.sceneIndex + (dx < 0 ? 1 : -1), true);
  }, { passive: true });
}

function bindViewGrid(): void {
  document.querySelectorAll<HTMLElement>(".view-panel").forEach((panel) => {
    panel.addEventListener("click", () => {
      const idx = Number(panel.dataset.viewIndex ?? 0);
      state.viewIndex = idx;
      state.userPinnedView = true;
      setActiveView(idx);
    });
  });
}

function cycleView(delta: number, userInitiated = false): void {
  if (userInitiated) state.userPinnedView = true;
  const next = (state.viewIndex + delta + VIEWS_PER_SCENE) % VIEWS_PER_SCENE;
  state.viewIndex = next;
  setActiveView(next);
}

function startViewAutoCycle(durationMs: number, token: number): void {
  clearViewCycleTimer();
  if (state.userPinnedView) return;

  state.viewIndex = 0;
  setActiveView(0);

  const stepMs = Math.max(2800, Math.floor(durationMs / VIEWS_PER_SCENE));
  viewCycleTimer = setInterval(() => {
    if (token !== state.playToken || state.userPinnedView || !state.playing || state.userPaused) return;
    const next = (state.viewIndex + 1) % VIEWS_PER_SCENE;
    state.viewIndex = next;
    setActiveView(next);
  }, stepMs);
}

function currentScene(): Scene {
  return SCENES[state.sceneIndex]!;
}

function goToScene(index: number, userInitiated = false): void {
  if (index < 0) return;
  if (index >= SCENE_COUNT) {
    finishPresentation();
    return;
  }
  if (userInitiated) state.userPaused = !state.playing;
  showScene(index, userInitiated || state.playing);
}

function showScene(index: number, autoplay: boolean): void {
  clearAdvanceTimer();
  clearViewCycleTimer();
  narration.stop();
  cancelAnimationFrame(progressRaf);
  state.playToken++;

  state.sceneIndex = index;
  state.viewIndex = 0;
  state.userPinnedView = false;
  state.ended = false;
  hideEndOverlay();

  const scene = currentScene();
  const stage = document.getElementById("stage")!;
  stage.innerHTML = renderSceneContent(scene);
  bindViewGrid();

  updateDots();
  updateCounter();
  resetProgress();

  requestAnimationFrame(() => stage.querySelector(".scene-inner")?.classList.add("is-visible"));

  if (autoplay && state.playing && !state.userPaused) {
    void playScene(scene, state.playToken);
  } else {
    setProgress(0);
    setActiveView(0);
  }
}

async function playScene(scene: Scene, token: number): Promise<void> {
  clearAdvanceTimer();
  clearViewCycleTimer();
  narration.stop();

  const duration = FALLBACK_DURATIONS_MS[scene.id] ?? 16000;
  startViewAutoCycle(duration, token);

  const onDone = () => {
    if (token !== state.playToken) return;
    scheduleAdvance(500);
  };

  if (state.mode === "audio" && !state.muted) {
    const el = await narration.play(scene.id);
    if (token !== state.playToken) return;

    if (el) {
      el.onended = onDone;
      el.onerror = () => animateProgressFor(duration, onDone, token);
      animateProgressFromAudio(el, token);
      const audioDuration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : duration;
      startViewAutoCycle(audioDuration, token);
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
    if (!state.playing || state.userPaused) {
      progressRaf = requestAnimationFrame(tick);
      return;
    }
    const p = Math.min(1, (now - start) / ms);
    setProgress(p);
    if (p >= 1) onComplete();
    else progressRaf = requestAnimationFrame(tick);
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
  state.ended = true;
  state.playing = false;
  clearAdvanceTimer();
  clearViewCycleTimer();
  narration.stop();
  setProgress(1);
  updatePlayButton();
  showEndOverlay();
}

function restart(): void {
  state.ended = false;
  state.playing = true;
  state.userPaused = false;
  state.userPinnedView = false;
  hideEndOverlay();
  updatePlayButton();
  showScene(0, true);
}

function togglePause(): void {
  if (state.ended) return;
  state.playing = !state.playing;
  state.userPaused = !state.playing;
  updatePlayButton();
  if (state.playing) {
    const el = narration.active;
    if (el && !state.muted) void el.play().catch(() => playScene(currentScene(), ++state.playToken));
    else void playScene(currentScene(), ++state.playToken);
  } else {
    clearAdvanceTimer();
    clearViewCycleTimer();
    narration.stop();
    cancelAnimationFrame(progressRaf);
  }
}

function toggleMute(): void {
  if (state.mode === "muted") {
    state.mode = "audio";
    state.muted = false;
  } else {
    state.muted = !state.muted;
  }
  updateMuteButton();
  if (state.muted) narration.stop();
  else if (state.playing && !state.userPaused) void playScene(currentScene(), ++state.playToken);
}

function updateMuteButton(): void {
  const btn = document.getElementById("btn-mute")!;
  btn.textContent = state.mode === "muted" || state.muted ? "Unmute" : "Mute";
  btn.classList.toggle("is-muted", state.mode === "muted" || state.muted);
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

function resetProgress(): void {
  setProgress(0);
}

function setProgress(ratio: number): void {
  document.getElementById("progress-fill")!.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
}

mount();
