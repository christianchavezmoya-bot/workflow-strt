/**
 * Real optical/sensor camera zoom for the capture preview, via MediaStreamTrack constraints.
 *
 * Zoom is applied to the CAMERA (applyConstraints), never faked with a CSS transform: the preview
 * <video> and the frames we crop for decoding/OCR both come from the same zoomed stream, so the
 * on-screen target and the source-pixel crop (cameraCropMath.ts) keep agreeing at any zoom.
 *
 * Support is detected per track from getCapabilities(), never assumed from the platform: some
 * browsers/WebViews/cameras expose `zoom`, some don't, and a missing capability simply means no
 * pinch zoom — never an error.
 */

export interface ZoomRange {
  min: number;
  max: number;
  /** 0 = continuous. */
  step: number;
}

/** The subset of MediaStreamTrack this module touches — keeps it testable with plain objects. */
export interface ZoomableTrack {
  readyState?: MediaStreamTrackState;
  getCapabilities?: () => unknown;
  getSettings?: () => unknown;
  applyConstraints: (constraints?: MediaTrackConstraints) => Promise<void>;
}

/** The live video track of a stream, or null. */
export function liveVideoTrack(stream: MediaStream | null | undefined): ZoomableTrack | null {
  if (!stream) return null;
  const tracks = typeof stream.getVideoTracks === "function" ? stream.getVideoTracks() : stream.getTracks();
  return (tracks.find((t) => t.readyState === "live") as ZoomableTrack | undefined) ?? null;
}

/** The track's zoom range, or null when zoom isn't exposed (or isn't a usable range). */
export function readZoomRange(track: ZoomableTrack | null | undefined): ZoomRange | null {
  if (!track || typeof track.getCapabilities !== "function") return null;
  let caps: unknown;
  try {
    caps = track.getCapabilities();
  } catch {
    return null;
  }
  const zoom = (caps as { zoom?: { min?: unknown; max?: unknown; step?: unknown } } | null)?.zoom;
  const min = zoom?.min;
  const max = zoom?.max;
  if (typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  if (!(max > min) || min <= 0) return null;
  const step = typeof zoom?.step === "number" && zoom.step > 0 && Number.isFinite(zoom.step) ? zoom.step : 0;
  return { min, max, step };
}

/** Clamps into [min, max] and snaps to the capability's step (relative to min). */
export function clampZoom(value: number, range: ZoomRange): number {
  if (!Number.isFinite(value)) return range.min;
  let v = Math.min(range.max, Math.max(range.min, value));
  if (range.step > 0) {
    v = range.min + Math.round((v - range.min) / range.step) * range.step;
    v = Math.min(range.max, Math.max(range.min, v));
  }
  return Math.round(v * 1000) / 1000; // kill float noise from step arithmetic
}

/** The zoom the track is actually at now (clamped), falling back to the minimum. */
export function readCurrentZoom(track: ZoomableTrack, range: ZoomRange): number {
  try {
    const zoom = (track.getSettings?.() as { zoom?: unknown } | undefined)?.zoom;
    if (typeof zoom === "number") return clampZoom(zoom, range);
  } catch { /* fall through */ }
  return range.min;
}

export function touchDistance(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }): number {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

/** Zoom for a pinch that started at `startDistance` with the camera at `startZoom`. Spreading the
 *  fingers to twice the distance doubles the zoom. */
export function zoomForPinch(startZoom: number, startDistance: number, currentDistance: number, range: ZoomRange): number {
  if (!(startDistance > 0) || !(currentDistance > 0)) return clampZoom(startZoom, range);
  return clampZoom(startZoom * (currentDistance / startDistance), range);
}

/** Applies a zoom level. Resolves false (never rejects) when the camera refuses it. */
export async function applyZoom(track: ZoomableTrack, zoom: number): Promise<boolean> {
  try {
    // `advanced` is the form every implementation that supports zoom accepts; `zoom` isn't in
    // lib.dom's constraint types yet.
    await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
    return true;
  } catch {
    return false;
  }
}

export function formatZoom(zoom: number): string {
  return `${zoom.toFixed(1)}×`;
}
