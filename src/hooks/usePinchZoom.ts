import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  nextPinchZoom,
  nextWheelZoom,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  toggleZoom,
  touchDistance,
} from "../utils/pinchZoom";

type UsePinchZoomOptions = {
  /** Current zoom factor, owned by the caller so toolbar buttons stay in sync. */
  zoom: number;
  onZoomChange: (zoom: number) => void;
  enabled?: boolean;
  min?: number;
  max?: number;
  /** Double-tap to toggle between fit and magnified. */
  doubleTapToZoom?: boolean;
};

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 40;

/**
 * Two-finger pinch, double-tap and ctrl+wheel zoom for a scrollable preview
 * surface. Panning is left to the container's own overflow scrolling, so a
 * zoomed image is dragged with one finger exactly like a native photo viewer.
 *
 * Listeners are registered manually because React attaches `touchmove`/`wheel`
 * passively, which forbids the preventDefault needed to stop the browser from
 * zooming the whole page instead of the document.
 */
export function usePinchZoom<T extends HTMLElement>({
  zoom,
  onZoomChange,
  enabled = true,
  min = PREVIEW_ZOOM_MIN,
  max = PREVIEW_ZOOM_MAX,
  doubleTapToZoom = true,
}: UsePinchZoomOptions): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const zoomRef = useRef(zoom);
  const onZoomChangeRef = useRef(onZoomChange);
  const pinchRef = useRef<{ startDistance: number; startZoom: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

  zoomRef.current = zoom;
  onZoomChangeRef.current = onZoomChange;

  const applyZoom = useCallback((next: number) => {
    if (next === zoomRef.current) return;
    zoomRef.current = next;
    onZoomChangeRef.current(next);
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !enabled) return;

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        pinchRef.current = {
          startDistance: touchDistance(event.touches[0], event.touches[1]),
          startZoom: zoomRef.current,
        };
        lastTapRef.current = null;
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const distance = touchDistance(event.touches[0], event.touches[1]);
      applyZoom(nextPinchZoom(pinch.startZoom, pinch.startDistance, distance, min, max));
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchRef.current = null;
      if (!doubleTapToZoom || event.touches.length > 0) return;

      const touch = event.changedTouches[0];
      if (!touch) return;

      const now = Date.now();
      const previous = lastTapRef.current;
      const isDoubleTap =
        previous !== null &&
        now - previous.time < DOUBLE_TAP_MS &&
        Math.abs(touch.clientX - previous.x) < DOUBLE_TAP_SLOP_PX &&
        Math.abs(touch.clientY - previous.y) < DOUBLE_TAP_SLOP_PX;

      if (isDoubleTap) {
        lastTapRef.current = null;
        applyZoom(toggleZoom(zoomRef.current, min, max));
        return;
      }

      lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
    };

    const handleWheel = (event: WheelEvent) => {
      // Trackpad pinch arrives as ctrl+wheel; a plain wheel must still scroll.
      if (!event.ctrlKey) return;
      event.preventDefault();
      applyZoom(nextWheelZoom(zoomRef.current, event.deltaY, min, max));
    };

    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchmove", handleTouchMove, { passive: false });
    node.addEventListener("touchend", handleTouchEnd, { passive: true });
    node.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    node.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
      node.removeEventListener("touchend", handleTouchEnd);
      node.removeEventListener("touchcancel", handleTouchEnd);
      node.removeEventListener("wheel", handleWheel);
    };
  }, [applyZoom, doubleTapToZoom, enabled, max, min]);

  return containerRef;
}
