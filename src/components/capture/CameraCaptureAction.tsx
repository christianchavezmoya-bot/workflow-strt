/**
 * Camera-assisted field entry: a small icon beside eligible workflow fields (text/number/scan)
 * that lets a technician scan a QR code, scan a common industrial barcode, or capture a targeted
 * region of text via OCR, as an ALTERNATIVE input method to typing. See
 * docs — this is described end-to-end in the PR description; the essential invariant is:
 *
 *   A confirmed capture result is not a new kind of data. It becomes the ordinary field value —
 *   calling the exact same onChange(value) a keyboard edit would — and only ever does so after
 *   the technician explicitly presses "Use Value". Nothing here ever mutates the field before
 *   that point, and Cancel/Retake/Scan Again/any failure leaves the field completely untouched.
 *
 * QR/barcode and OCR share one camera preview + target-window + crop pipeline
 * (cameraCropMath.ts) so neither mode ever processes anything outside the region the technician
 * aimed at — a full, unconstrained camera frame is never handed to a decoder or to OCR.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CameraAltOutlined from "@mui/icons-material/CameraAltOutlined";
import QrCodeScannerOutlined from "@mui/icons-material/QrCodeScannerOutlined";
import {
  decodeBarcodeFromCanvas,
  isCameraCaptureSupported,
  recognizeTextFromCanvas,
  startCameraStream,
  stopCameraStream,
} from "../../services/cameraCaptureService";
import { computeSourceCropRect } from "../../utils/cameraCropMath";
import {
  nativeDialogActionsSx,
  nativeDialogPaperSx,
  nativeNestedDialogSx,
  nativePopoverSx,
} from "../../utils/nativeDialogInsets";

export type CameraCaptureFieldKind = "text" | "number" | "scan";

export interface CameraCaptureActionProps {
  /** Current field value — read only to decide the Cancel/Retake no-op guarantee; never mutated
   *  directly by this component. */
  value: string;
  /** The SAME onChange a keyboard edit on this field already calls — the only field-update path. */
  onChange: (value: string) => void;
  fieldKind: CameraCaptureFieldKind;
  disabled?: boolean;
  /** Accessible label for the trigger icon — callers should pass the field's own label. */
  ariaLabel?: string;
}

type DialogMode = "qr-barcode" | "ocr";

/** Small trigger: icon -> "Capture Value" menu -> opens the capture dialog for the chosen mode.
 *  Renders for text/number/scan fields only — callers decide eligibility; this component itself
 *  doesn't gate on fieldKind beyond using it for the tooltip/aria text. */
export function CameraCaptureAction({ value, onChange, fieldKind, disabled, ariaLabel }: CameraCaptureActionProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const supported = isCameraCaptureSupported();

  const label = ariaLabel ? `Capture ${ariaLabel} with camera` : "Capture value with camera";

  return (
    <>
      <Tooltip title={supported ? label : "Camera capture isn't available in this browser — enter the value manually."}>
        {/* span wrapper so the tooltip still shows on a disabled button */}
        <span>
          <IconButton
            size="small"
            aria-label={label}
            disabled={disabled || !supported}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
          >
            {fieldKind === "scan" ? <QrCodeScannerOutlined fontSize="small" /> : <CameraAltOutlined fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
      {/* Rendered from inside WorkOrderRunner, whose Dialog is pinned to NATIVE_DIALOG_Z_INDEX on
          native. Without the nested z-index this Menu opens behind the runner — invisible and
          undismissable — while its focus trap still steals focus from every workflow field. */}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)} sx={nativePopoverSx()}>
        <MenuItem
          onClick={() => {
            setDialogMode("qr-barcode");
            setMenuAnchor(null);
          }}
        >
          QR / Barcode
        </MenuItem>
        <MenuItem
          onClick={() => {
            setDialogMode("ocr");
            setMenuAnchor(null);
          }}
        >
          Text / OCR
        </MenuItem>
        <MenuItem onClick={() => setMenuAnchor(null)}>Cancel</MenuItem>
      </Menu>
      {dialogMode && (
        <CameraCaptureDialog
          mode={dialogMode}
          currentValue={value}
          onClose={() => setDialogMode(null)}
          onConfirm={(next) => {
            onChange(next);
            setDialogMode(null);
          }}
        />
      )}
    </>
  );
}

// ── Dialog / state machine ───────────────────────────────────────────────────────────────────

type Phase = "opening" | "previewing" | "capturing" | "recognizing" | "reviewing" | "error";

interface Candidate {
  value: string;
  format?: string;
  croppedDataUrl?: string;
}

function describeCameraError(err: unknown): string {
  const name = (err as { name?: string } | undefined)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was denied. Allow camera access to use this, or enter the value manually.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device. Enter the value manually.";
  }
  if (name === "NotReadableError") {
    return "The camera is unavailable right now (it may be in use by another app). Enter the value manually.";
  }
  return "Couldn't start the camera. Enter the value manually.";
}

/** A stream is only reusable while at least one of its tracks is still "live". The OS can end
 *  tracks behind our back (camera taken by another app, WebView backgrounded), and an ended
 *  track renders black forever — so Retake/Scan Again checks this rather than assuming. */
function isStreamLive(stream: MediaStream | null): stream is MediaStream {
  return !!stream && stream.getTracks().some((t) => t.readyState === "live");
}

/** Points a <video> at a stream and starts playback. Idempotent for the same pair. */
function bindStreamToVideo(video: HTMLVideoElement, stream: MediaStream | null) {
  if (!stream || video.srcObject === stream) return;
  video.srcObject = stream;
  try {
    const playing = video.play();
    if (playing) playing.catch(() => { /* autoplay quirks — preview still renders */ });
  } catch { /* same */ }
}

export interface CameraCaptureDialogProps {
  mode: DialogMode;
  currentValue: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}

/** Exported for testing; used internally by CameraCaptureAction. */
export function CameraCaptureDialog({ mode, onClose, onConfirm }: CameraCaptureDialogProps) {
  const [phase, setPhase] = useState<Phase>("opening");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  // What the technician is about to commit: starts as the exact decoder/OCR candidate and is
  // freely editable. Lives only in this dialog — the workflow field is untouched until Use Value.
  const [draftValue, setDraftValue] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // OCR recognition can take seconds. If the technician cancels, navigates away, or the dialog is
  // otherwise unmounted while it runs, the late result must be dropped entirely — it must not set
  // state on a dead component, and above all it must never reach the field.
  //
  // Two separate flags on purpose: unmounting is not the only way a capture is abandoned. Cancel
  // is a dismissal even if the parent keeps this component mounted for its close animation, so
  // the dialog refuses late results on its own rather than trusting the caller to unmount it.
  const mountedRef = useRef(true);
  const dismissedRef = useRef(false);
  const isLive = () => mountedRef.current && !dismissedRef.current;

  // Bumped whenever the current camera request is superseded (Retake reacquire, Cancel, Use
  // Value, unmount). A getUserMedia() that resolves under an old generation is stopped on arrival
  // and never attached — so a slow permission prompt can't bind a stream to a closed dialog.
  const streamGenRef = useRef(0);

  // The preview <video> only exists while the preview is on screen: "reviewing" unmounts it, and
  // Retake/Scan Again mounts a brand-new element. Binding the stream here, whenever an element
  // mounts, is what keeps the preview live across that remount — assigning srcObject once at
  // open time left the re-mounted <video> with no source, i.e. a black preview on Retake.
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    if (!el && videoRef.current) videoRef.current.srcObject = null; // detach the outgoing element
    videoRef.current = el;
    if (el) bindStreamToVideo(el, streamRef.current);
  }, []);

  async function openCamera() {
    const gen = ++streamGenRef.current;
    setPhase("opening");
    try {
      const stream = await startCameraStream();
      if (gen !== streamGenRef.current || !isLive()) {
        stopCameraStream(stream);
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) bindStreamToVideo(videoRef.current, stream);
      setPhase("previewing");
    } catch (err) {
      if (gen !== streamGenRef.current || !isLive()) return;
      setPhase("error");
      setErrorMessage(describeCameraError(err));
    }
  }

  // ── Open the camera on mount; ALWAYS release it on unmount, regardless of how we got there. ──
  useEffect(() => {
    mountedRef.current = true;
    dismissedRef.current = false;
    if (!isCameraCaptureSupported()) {
      setPhase("error");
      setErrorMessage("Camera capture isn't supported in this browser. Enter the value manually.");
      return () => { /* nothing to release — stream never opened */ };
    }
    void openCamera();
    return () => {
      mountedRef.current = false;
      releaseCamera();
    };
    // Intentionally once per mount: this dialog is remounted fresh for each capture attempt, and
    // Retake/Scan Again call openCamera() directly. Re-running on openCamera identity would
    // reopen the camera on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── QR/barcode: continuous decode of ONLY the cropped target region while previewing. Stops
  // the instant a valid code is found — never runs during "reviewing", never touches anything
  // outside the crop. ──
  useEffect(() => {
    if (mode !== "qr-barcode" || phase !== "previewing") return;
    let active = true;

    const tick = () => {
      if (!active) return;
      const cropped = captureCroppedFrame();
      if (cropped) {
        void decodeBarcodeFromCanvas(cropped).then((result) => {
          if (!active || !isLive()) return;
          if (result) {
            setCandidate({ value: result.value, format: result.format });
            setDraftValue(result.value);
            setPhase("reviewing");
            return; // do not reschedule — loop stops on a valid candidate
          }
          scanLoopTimerRef.current = setTimeout(tick, 150);
        });
      } else {
        scanLoopTimerRef.current = setTimeout(tick, 150);
      }
    };
    tick();

    return () => {
      active = false;
      if (scanLoopTimerRef.current) clearTimeout(scanLoopTimerRef.current);
    };
  }, [mode, phase]);

  /** Crops the CURRENT video frame to the target-window region only. Returns null (never a
   *  full-frame canvas) if geometry isn't ready yet (e.g. stream metadata not loaded) — callers
   *  must treat null as "try again next tick" / "can't capture yet", never fall back to the full
   *  frame. */
  function captureCroppedFrame(): HTMLCanvasElement | null {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || !video.videoWidth || !video.videoHeight) return null;

    const crop = computeSourceCropRect({
      videoIntrinsicSize: { width: video.videoWidth, height: video.videoHeight },
      videoDisplayRect: video.getBoundingClientRect(),
      overlayRect: overlay.getBoundingClientRect(),
    });
    if (crop.width <= 0 || crop.height <= 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(crop.width));
    canvas.height = Math.max(1, Math.round(crop.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /** OCR only — explicit user-initiated Capture. Never runs automatically, never fires from the
   *  QR/barcode continuous loop. */
  async function handleCapture() {
    setErrorMessage(null); // a previous attempt's warning must not linger over a fresh capture
    setPhase("capturing");
    const cropped = captureCroppedFrame();
    if (!cropped) {
      setErrorMessage("Couldn't read the camera yet — reposition and try again.");
      setPhase("previewing");
      return;
    }
    setPhase("recognizing");
    try {
      const text = await recognizeTextFromCanvas(cropped);
      // Dropped on purpose if the dialog closed while recognition was running: a late result must
      // never resurrect a dismissed dialog, and must never reach the field.
      if (!isLive()) return;
      let croppedDataUrl: string | undefined;
      try { croppedDataUrl = cropped.toDataURL("image/png"); } catch { /* preview is best-effort */ }
      setCandidate({ value: text, croppedDataUrl });
      setDraftValue(text);
      setPhase("reviewing");
    } catch {
      if (!isLive()) return;
      // Always leaves "Reading…" — recognizeTextFromCanvas() is time-bounded, so even an
      // unreachable/corrupt OCR asset lands here rather than hanging. The field keeps its
      // existing value, and Capture/Retake/Cancel/manual entry all stay available.
      setErrorMessage("Couldn't read text from that image. Reposition and try again, or type the value.");
      setPhase("previewing");
    }
  }

  function handleUseValue() {
    if (!candidate || !draftValue || !isLive()) return;
    dismissedRef.current = true; // a double-tap must not fire onChange twice
    releaseCamera();
    // The ONLY call in this whole component that reaches onChange — with exactly what the
    // technician left in the review field (their correction, if they made one).
    onConfirm(draftValue);
  }

  /** Retake (OCR) / Scan Again (QR/barcode): discard the candidate (and any edit to it) and go
   *  back to a LIVE preview. A still-live stream is reused — no repeat permission prompt — and
   *  re-bound to the freshly mounted <video> by attachVideo. A stream whose tracks have ended is
   *  stopped and replaced with a new one. The field is never touched. */
  function handleRetakeOrScanAgain() {
    setCandidate(null);
    setDraftValue("");
    setErrorMessage(null);
    if (isStreamLive(streamRef.current)) {
      setPhase("previewing");
      return;
    }
    releaseCamera();
    void openCamera();
  }

  /** Releases the camera immediately and makes the release idempotent, so the unmount cleanup
   *  that follows is a harmless no-op rather than a second stop on a dead stream. The technician
   *  should see the camera indicator go out the moment they finish, not whenever React unmounts.
   *  Also invalidates any camera request still in flight. */
  function releaseCamera() {
    streamGenRef.current += 1;
    if (scanLoopTimerRef.current) clearTimeout(scanLoopTimerRef.current);
    stopCameraStream(streamRef.current);
    streamRef.current = null;
  }

  function handleCancel() {
    dismissedRef.current = true; // stop accepting any in-flight decode/recognition result
    releaseCamera();
    onClose();
  }

  const isOcr = mode === "ocr";
  const title = isOcr ? "Capture Text" : "Scan QR / Barcode";

  return (
    <Dialog
      open
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      // Same native stacking requirement as the mode Menu above: must sit above the runner.
      sx={nativeNestedDialogSx()}
      PaperProps={{ sx: nativeDialogPaperSx() }}
    >
      <DialogTitle>{phase === "reviewing" ? "Review Capture" : title}</DialogTitle>
      <DialogContent>
        {/* Shown for BOTH the terminal "error" phase (camera unavailable) and a recoverable
            failure that dropped us back to previewing (OCR timed out / couldn't read) — otherwise
            a failed Capture would silently return to the preview with no explanation at all. */}
        {errorMessage && (
          <Alert severity="warning" sx={{ mb: 2 }}>{errorMessage}</Alert>
        )}

        {(phase === "opening" || phase === "previewing" || phase === "capturing" || phase === "recognizing") && (
          <Box sx={{ position: "relative", width: "100%", aspectRatio: "3 / 4", bgcolor: "#000", overflow: "hidden", borderRadius: 1 }}>
            <video
              ref={attachVideo}
              data-testid="camera-capture-video"
              playsInline
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            {/* Target window — the FUNCTIONAL crop region, not merely cosmetic: captureCroppedFrame()
                reads this exact element's own bounding rect. */}
            <Box
              ref={overlayRef}
              data-testid="camera-capture-target-window"
              sx={
                isOcr
                  ? {
                      position: "absolute", left: "10%", right: "10%", top: "45%", height: "14%",
                      border: "2px solid #fff", borderRadius: 1, boxShadow: "0 0 0 2000px rgba(0,0,0,0.35)",
                      pointerEvents: "none",
                    }
                  : {
                      position: "absolute", left: "20%", right: "20%", top: "30%", bottom: "30%",
                      border: "2px solid #fff", borderRadius: 1, boxShadow: "0 0 0 2000px rgba(0,0,0,0.35)",
                      pointerEvents: "none",
                    }
              }
            />
            <Typography
              variant="caption"
              sx={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", color: "#fff" }}
            >
              {isOcr ? "Position text inside frame" : "Place code in frame"}
            </Typography>
            {(phase === "recognizing" || phase === "capturing") && (
              <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(0,0,0,0.4)" }}>
                <Typography variant="body2" sx={{ color: "#fff" }}>Reading…</Typography>
              </Box>
            )}
          </Box>
        )}

        {phase === "reviewing" && candidate && (
          <Stack spacing={1.5}>
            {candidate.croppedDataUrl && (
              <Box component="img" src={candidate.croppedDataUrl} alt="Captured region" sx={{ width: "100%", borderRadius: 1, border: "1px solid", borderColor: "divider" }} />
            )}
            {candidate.format && (
              <Typography variant="caption" color="text.secondary">
                Detected: {candidate.format.toUpperCase()}
              </Typography>
            )}
            <TextField
              label="Detected value"
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              placeholder={candidate.value ? undefined : "No text found — type the value"}
              helperText="Check it against the label and correct it if needed before using it."
              fullWidth
              autoComplete="off"
              inputProps={{ autoCapitalize: "none", autoCorrect: "off", spellCheck: false }}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={nativeDialogActionsSx()}>
        {phase === "reviewing" ? (
          <>
            <Button onClick={handleCancel}>Cancel</Button>
            <Button onClick={handleRetakeOrScanAgain}>{isOcr ? "Retake" : "Scan Again"}</Button>
            <Button variant="contained" onClick={handleUseValue} disabled={!draftValue}>
              Use Value
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleCancel}>Cancel</Button>
            {isOcr && phase === "previewing" && (
              <Button variant="contained" onClick={() => { void handleCapture(); }}>
                Capture
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
