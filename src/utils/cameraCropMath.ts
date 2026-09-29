/**
 * Pure viewport-to-source-image crop geometry for camera-assisted field capture
 * (QR/barcode targeting and OCR targeting both use this — see
 * services/cameraCaptureService.ts and components/capture/CameraCaptureDialog.tsx).
 *
 * A <video> preview is rendered with object-fit:"cover" inside some CSS-sized
 * container. A target-window overlay is positioned (in CSS pixels) over that
 * container. This module answers: which rectangle of the video's OWN intrinsic
 * pixel grid (videoWidth x videoHeight — the actual camera stream resolution,
 * completely independent of CSS/devicePixelRatio) corresponds to what the
 * technician sees inside the target window?
 *
 * No DOM, no canvas — every input here is a plain rect a caller reads from
 * getBoundingClientRect()/video.videoWidth/video.videoHeight, so this is fully
 * unit-testable without a browser/camera at all.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface IntrinsicSize {
  width: number;
  height: number;
}

export interface ComputeSourceCropRectInput {
  /** The video stream's own pixel resolution (video.videoWidth/videoHeight). */
  videoIntrinsicSize: IntrinsicSize;
  /** The <video> element's CSS bounding rect (getBoundingClientRect()). */
  videoDisplayRect: Rect;
  /** The target-window overlay's CSS bounding rect (getBoundingClientRect()). */
  overlayRect: Rect;
}

export interface SourceCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Maps a CSS-positioned target-window overlay onto the video's own intrinsic
 * pixel grid, accounting for object-fit:"cover" scaling/clipping. Device pixel
 * ratio does NOT need separate handling: videoDisplayRect and overlayRect are
 * both already in the same CSS-pixel coordinate space (from
 * getBoundingClientRect()), so DPR cancels out consistently between them.
 *
 * Returns a rect clamped to the video's actual bounds — never negative,
 * never larger than the source frame, even if the overlay were partially
 * outside the video element (shouldn't happen in the real UI, but a caller
 * cropping with drawImage must never receive out-of-range values).
 */
export function computeSourceCropRect(input: ComputeSourceCropRectInput): SourceCropRect {
  const { videoIntrinsicSize, videoDisplayRect, overlayRect } = input;
  const { width: videoWidth, height: videoHeight } = videoIntrinsicSize;

  if (
    videoWidth <= 0 || videoHeight <= 0 ||
    videoDisplayRect.width <= 0 || videoDisplayRect.height <= 0
  ) {
    // Degenerate input (stream not yet ready, container not yet laid out) —
    // never divide by zero; return an empty rect rather than throw, so a
    // caller can simply skip this frame and try again on the next one.
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  // object-fit:"cover" scale factor: the LARGER of the two ratios, so the
  // scaled content fully covers the container (overflowing/clipping on one
  // axis) rather than "contain" (which would use the smaller ratio).
  const scale = Math.max(
    videoDisplayRect.width / videoWidth,
    videoDisplayRect.height / videoHeight,
  );

  const displayedContentWidth = videoWidth * scale;
  const displayedContentHeight = videoHeight * scale;

  // "cover" centers the (over-sized) scaled content within the container, so
  // this offset is typically negative (content extends past the container
  // and is clipped) on whichever axis isn't the constraining one.
  const offsetX = (videoDisplayRect.width - displayedContentWidth) / 2;
  const offsetY = (videoDisplayRect.height - displayedContentHeight) / 2;

  // Overlay position relative to the video element's own top-left corner,
  // then relative to the displayed (scaled) content's top-left corner.
  const overlayRelToVideoX = overlayRect.left - videoDisplayRect.left;
  const overlayRelToVideoY = overlayRect.top - videoDisplayRect.top;
  const overlayRelToContentX = overlayRelToVideoX - offsetX;
  const overlayRelToContentY = overlayRelToVideoY - offsetY;

  // Convert from displayed (scaled) content pixels back to intrinsic source
  // pixels.
  const srcX = overlayRelToContentX / scale;
  const srcY = overlayRelToContentY / scale;
  const srcWidth = overlayRect.width / scale;
  const srcHeight = overlayRect.height / scale;

  // Clamp to the video's actual intrinsic bounds.
  const clampedX = Math.max(0, Math.min(srcX, videoWidth));
  const clampedY = Math.max(0, Math.min(srcY, videoHeight));
  const clampedRight = Math.max(clampedX, Math.min(srcX + srcWidth, videoWidth));
  const clampedBottom = Math.max(clampedY, Math.min(srcY + srcHeight, videoHeight));

  return {
    x: clampedX,
    y: clampedY,
    width: clampedRight - clampedX,
    height: clampedBottom - clampedY,
  };
}
