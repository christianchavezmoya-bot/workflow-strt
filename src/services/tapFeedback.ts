let audioCtx: AudioContext | null = null;
let initialized = false;

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioCtx;
}

export function playTapSound(): void {
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.025);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  } catch { /* audio unavailable — silently skip */ }
}

export function initTapFeedback(): void {
  if (initialized) return;
  initialized = true;

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
        playTapSound();
      }
    },
    { passive: true }
  );
}
