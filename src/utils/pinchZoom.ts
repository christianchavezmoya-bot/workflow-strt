/** Zoom bounds shared by the preview toolbar buttons, pinch gestures and wheel zoom. */
export const PREVIEW_ZOOM_MIN = 0.5;
export const PREVIEW_ZOOM_MAX = 5;
export const PREVIEW_ZOOM_STEP = 0.15;

export type PinchPoint = { clientX: number; clientY: number };

export function touchDistance(a: PinchPoint, b: PinchPoint): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

export function clampZoom(
  value: number,
  min = PREVIEW_ZOOM_MIN,
  max = PREVIEW_ZOOM_MAX,
): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Number(value.toFixed(3))));
}

/**
 * Scale relative to where the pinch started, so a gesture that returns to its
 * starting spread returns to the starting zoom instead of drifting.
 */
export function nextPinchZoom(
  startZoom: number,
  startDistance: number,
  currentDistance: number,
  min = PREVIEW_ZOOM_MIN,
  max = PREVIEW_ZOOM_MAX,
): number {
  if (startDistance <= 0) return clampZoom(startZoom, min, max);
  return clampZoom(startZoom * (currentDistance / startDistance), min, max);
}

/**
 * Ctrl+wheel is what a desktop trackpad pinch reports, so the same gesture works
 * on a laptop without a touchscreen.
 */
export function nextWheelZoom(
  current: number,
  deltaY: number,
  min = PREVIEW_ZOOM_MIN,
  max = PREVIEW_ZOOM_MAX,
): number {
  // Wheel deltas vary wildly between devices; the exponent keeps the response
  // proportional rather than jumping several steps on a high-resolution trackpad.
  const factor = Math.exp(-deltaY / 320);
  return clampZoom(current * factor, min, max);
}

/** Double-tap toggles between fit and a readable magnification. */
export function toggleZoom(
  current: number,
  min = PREVIEW_ZOOM_MIN,
  max = PREVIEW_ZOOM_MAX,
  target = 2,
): number {
  const fit = clampZoom(1, min, max);
  if (current > fit + 0.05) return fit;
  return clampZoom(target, min, max);
}

export function stepZoom(
  current: number,
  direction: 1 | -1,
  min = PREVIEW_ZOOM_MIN,
  max = PREVIEW_ZOOM_MAX,
): number {
  return clampZoom(current + direction * PREVIEW_ZOOM_STEP, min, max);
}

export function formatZoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
