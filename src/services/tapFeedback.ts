import { isMobileNativePlatform } from "../utils/platform";

let audioCtx: AudioContext | null = null;
let initialized = false;
let audioUnlocked = false;

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioCtx;
}

async function unlockAudio(): Promise<void> {
  if (audioUnlocked) return;
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") await ctx.resume();
    audioUnlocked = ctx.state === "running";
  } catch {
    audioUnlocked = false;
  }
}

export async function playTapSound(): Promise<void> {
  if (!isMobileNativePlatform()) return;
  try {
    await unlockAudio();
    const ctx = getCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.025);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  } catch { /* audio unavailable — silently skip */ }
}

export function initTapFeedback(): void {
  if (initialized || !isMobileNativePlatform()) return;
  initialized = true;

  // Unlock Web Audio on the first touch — iOS/WKWebView requires a user gesture.
  document.addEventListener(
    "touchstart",
    () => { void unlockAudio(); },
    { passive: true, capture: true, once: true },
  );

  // Adding a touchstart listener on document activates CSS :active states on iOS WebView
  document.addEventListener(
    "touchstart",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(
          'button, [role="button"], .MuiButtonBase-root, .MuiChip-clickable, .MuiListItemButton-root, .tap-feedback'
        )
      ) {
        void playTapSound();
      }
    },
    { passive: true, capture: true },
  );
}
