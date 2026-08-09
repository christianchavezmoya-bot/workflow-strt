/**
 * syncAmbientAudio — loops ambient audio while upload or download is active.
 *
 * Driven by useSyncAmbientAudio (sync-engine:syncing + bootstrap:* events).
 * Stops automatically when both queues are idle or the app backgrounds.
 */

import ambientUrl from "../assets/ambient.mp3";
import { isSyncLifecyclePaused } from "./syncLifecycleState";
import { isMobileNativePlatform } from "../utils/platform";

const DEFAULT_VOLUME = 0.35;

let audio: HTMLAudioElement | null = null;
let uploadActive = false;
let downloadActive = false;
let playAttemptInFlight = false;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(ambientUrl);
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
