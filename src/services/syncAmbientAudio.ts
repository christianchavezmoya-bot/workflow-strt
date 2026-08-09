/**
 * syncAmbientAudio — loops ambient audio while upload or download is active.
 *
 * Audio file: place ambient.mp3 at repo root (workflow-strt/ambient.mp3).
 * prebuild/predev copies it to public/ambient.mp3 for Vite + Capacitor.
 */

import { isSyncLifecyclePaused } from "./syncLifecycleState";
import { isMobileNativePlatform } from "../utils/platform";

/** Served from public/ambient.mp3 (copied from repo root at build time). */
const AMBIENT_URL = "/ambient.mp3";

const DEFAULT_VOLUME = 0.35;

let audio: HTMLAudioElement | null = null;
let uploadActive = false;
let downloadActive = false;
let playAttemptInFlight = false;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(AMBIENT_URL);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = DEFAULT_VOLUME;
  }
  return audio;
}

function shouldPlay(): boolean {
  return isMobileNativePlatform()
    && !isSyncLifecyclePaused()
    && (uploadActive || downloadActive);
}

async function applyPlayback(): Promise<void> {
  const el = getAudio();
  if (!shouldPlay()) {
    playAttemptInFlight = false;
    if (!el.paused) {
      el.pause();
    }
    return;
  }

  if (!el.paused || playAttemptInFlight) return;
  playAttemptInFlight = true;
  try {
    await el.play();
  } catch {
    // iOS may reject autoplay until the next user gesture — harmless retry on next event.
  } finally {
    playAttemptInFlight = false;
  }
}

export function setSyncAmbientUploadActive(active: boolean): void {
  uploadActive = active;
  void applyPlayback();
}

export function setSyncAmbientDownloadActive(active: boolean): void {
  downloadActive = active;
  void applyPlayback();
}

export function refreshSyncAmbientPlayback(): void {
  void applyPlayback();
}

/** Pause playback without clearing busy flags (e.g. app backgrounded). */
export function pauseSyncAmbientAudio(): void {
  playAttemptInFlight = false;
  audio?.pause();
}

export function stopSyncAmbientAudio(): void {
  uploadActive = false;
  downloadActive = false;
  playAttemptInFlight = false;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}

export function setSyncAmbientVolume(volume: number): void {
  getAudio().volume = Math.min(1, Math.max(0, volume));
}
