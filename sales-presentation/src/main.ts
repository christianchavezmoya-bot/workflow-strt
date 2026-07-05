import { SCENES, SCENE_COUNT, FALLBACK_DURATIONS_MS, type Scene } from "./scenes";
import "./styles.css";
import {
  renderOpening,
  renderPresentationShell,
  renderEndOverlay,
  renderSceneContent,
} from "./visuals";

type StartMode = "audio" | "muted";

interface State {
  started: boolean;
  mode: StartMode;
  sceneIndex: number;
  currentSceneId: number;
  playing: boolean;
  muted: boolean;
  ended: boolean;
  userPaused: boolean;
}

const state: State = {
  started: false,
  mode: "audio",
  sceneIndex: 0,
  currentSceneId: 0,
  playing: false,
  muted: false,
  ended: false,
  userPaused: false,
};

let audio: HTMLAudioElement | null = null;
let advanceTimer: ReturnType<typeof setTimeout> | null = null;
let progressRaf = 0;
let touchStartX = 0;
const audioReady = new Map<number, Promise<void>>();

const app = document.getElementById("app")!;

function resolveAssetUrl(relativePath: string): string {
  try {
    return new URL(relativePath, document.baseURI).href;
  } catch {
    return relativePath;
  }
}

function warmAudio(scene: Scene): Promise<void> {
  const existing = audioReady.get(scene.id);
  if (existing) return existing;

  const promise = new Promise<void>((resolve) => {
    const el = new Audio(resolveAssetUrl(scene.audio));
    el.preload = "auto";
    const finish = () => resolve();
    el.addEventListener("canplaythrough", finish, { once: true });
    el.addEventListener("error", finish, { once: true });
    el.load();
    // Safety timeout so a bad file never blocks the deck
    setTimeout(finish, 4000);
  });

  audioReady.set(scene.id, promise);
  return promise;
}

function preloadAllAudio(): Promise<void> {
  return Promise.all(SCENES.map((s) => warmAudio(s))).then(() => undefined);
}

function clearAdvanceTimer(): void {
  if (advanceTimer) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }
}

function stopAudio(): void {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
    audio.onerror = null;
    audio = null;
  }
}

function mount(): void {
  app.innerHTML = renderOpening() + renderPresentationShell() + renderEndOverlay();
  bindOpening();
  buildSceneDots();
  bindControls();
  bindSwipe();
  bindHotspots();
}

function hideEndOverlay(): void {
  document.getElementById("end-overlay")!.classList.remove("is-visible");
}

function showEndOverlay(): void {
  document.getElementById("end-overlay")!.classList.add("is-visible");
}

function bindOpening(): void {
  document.getElementById("btn-start")!.addEventListener("click", () => void start("audio"));
  document.getElementById("btn-start-muted")!.addEventListener("click", () => void start("muted"));
}

async function start(mode: StartMode): Promise<void> {
  state.started = true;
  state.mode = mode;
  state.muted = mode === "muted";
  state.sceneIndex = 0;
  state.playing = true;
  state.ended = false;
  state.userPaused = false;

  document.getElementById("opening-screen")!.hidden = true;
  document.getElementById("presentation-screen")!.hidden = false;
  document.getElementById("controls")!.hidden = false;
  hideEndOverlay();

  if (mode === "audio" && !state.muted) {
    await preloadAllAudio();
  }

  updateMuteButton();
  showScene(0, true);
}

function buildSceneDots(): void {
  const dots = document.getElementById("scene-dots")!;
  dots.innerHTML = SCENES.map(
    (_, i) => `<button type="button" class="scene-dot" data-index="${i}" aria-label="Go to scene ${i + 1}"></button>`
  ).join("");
  dots.querySelectorAll(".scene-dot").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number((el as HTMLElement).dataset.index);
      goToScene(idx, true);
    });
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
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goToScene(state.sceneIndex - 1, true);
    } else if (e.key === "p" || e.key === "P") {
      togglePause();
    } else if (e.key === "m" || e.key === "M") {
      toggleMute();
    }
  });
}

function bindSwipe(): void {
  const stage = () => document.getElementById("stage")!;
  stage().addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.changedTouches[0]?.clientX ?? 0;
    },
    { passive: true }
  );
  stage().addEventListener(
    "touchend",
    (e) => {
      if (!state.started) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX;
      if (Math.abs(dx) < 50) return;
      if (dx < 0) goToScene(state.sceneIndex + 1, true);
      else goToScene(state.sceneIndex - 1, true);
    },
    { passive: true }
  );
}

function bindHotspots(): void {
  document.getElementById("stage")!.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".hotspot") as HTMLButtonElement | null;
    if (!btn) return;
    btn.classList.toggle("is-active");
    document.querySelectorAll(".hotspot.is-active").forEach((el) => {
      if (el !== btn) el.classList.remove("is-active");
    });
  });
}

function currentScene(): Scene {
  return SCENES[state.sceneIndex]!;
}

function goToScene(index: number, userInitiated = false): void {
  if (index < 0 || index >= SCENE_COUNT) {
    if (index >= SCENE_COUNT) finishPresentation();
    return;
  }
  if (userInitiated) {
    state.userPaused = !state.playing;
  }
  showScene(index, userInitiated);
}

function showScene(index: number, autoplay: boolean): void {
  clearAdvanceTimer();
  stopAudio();
  cancelAnimationFrame(progressRaf);

  state.sceneIndex = index;
  state.ended = false;
  hideEndOverlay();

  const scene = currentScene();
  state.currentSceneId = scene.id;
  const stage = document.getElementById("stage")!;
  stage.innerHTML = renderSceneContent(scene);
  stage.dataset.visual = scene.visual;

  updateDots();
  updateCounter();
  resetProgress();

  requestAnimationFrame(() => {
    stage.querySelector(".scene-inner")?.classList.add("is-visible");
  });

  if (autoplay && state.playing && !state.userPaused) {
    playScene(scene);
  } else {
    setProgress(0);
  }
}

function playScene(scene: Scene): void {
  clearAdvanceTimer();
  stopAudio();

  const duration = FALLBACK_DURATIONS_MS[scene.id] ?? 14000;

  if (state.mode === "audio" && !state.muted) {
    void warmAudio(scene).then(() => {
      if (state.currentSceneId !== scene.id) return;

      audio = new Audio(resolveAssetUrl(scene.audio));
      audio.volume = 1;
      audio.preload = "auto";

      const onDone = () => scheduleAdvance(600);

      audio.onended = onDone;
      audio.onerror = () => animateProgressFor(duration, onDone);

      const tryPlay = () => {
        if (!audio) return;
        audio
          .play()
          .then(() => animateProgressFromAudio(audio!))
          .catch(() => animateProgressFor(duration, onDone));
      };

      if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        tryPlay();
      } else {
        audio.addEventListener("canplaythrough", tryPlay, { once: true });
        audio.addEventListener("error", () => animateProgressFor(duration, onDone), { once: true });
        audio.load();
      }
    });
  } else {
    animateProgressFor(duration, () => scheduleAdvance(400));
  }
}

function animateProgressFromAudio(el: HTMLAudioElement): void {
  const tick = () => {
    if (!audio || audio !== el) return;
    const d = el.duration;
    if (Number.isFinite(d) && d > 0) {
      setProgress(el.currentTime / d);
    }
    progressRaf = requestAnimationFrame(tick);
  };
  progressRaf = requestAnimationFrame(tick);
}

function animateProgressFor(ms: number, onComplete: () => void): void {
  const start = performance.now();
  const tick = (now: number) => {
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
    else goToScene(state.sceneIndex + 1, false);
  }, delayMs);
}

function finishPresentation(): void {
  state.ended = true;
  state.playing = false;
  clearAdvanceTimer();
  stopAudio();
  setProgress(1);
  updatePlayButton();
  showEndOverlay();
}

function restart(): void {
  state.ended = false;
  state.playing = true;
  state.userPaused = false;
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
    if (audio && !state.muted) void audio.play().catch(() => undefined);
    else playScene(currentScene());
  } else {
    clearAdvanceTimer();
    if (audio) audio.pause();
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

  if (state.muted) {
    if (audio) audio.pause();
  } else if (state.playing && !state.userPaused && state.started) {
    playScene(currentScene());
  }
}

function updateMuteButton(): void {
  const btn = document.getElementById("btn-mute")!;
  if (state.mode === "muted" || state.muted) {
    btn.textContent = "Unmute";
    btn.classList.add("is-muted");
  } else {
    btn.textContent = "Mute";
    btn.classList.remove("is-muted");
  }
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
  const pct = `${Math.max(0, Math.min(100, ratio * 100))}%`;
  document.getElementById("progress-fill")!.style.width = pct;
}

mount();
