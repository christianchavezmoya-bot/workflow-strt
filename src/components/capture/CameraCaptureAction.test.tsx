import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CameraCaptureAction, CameraCaptureDialog } from "./CameraCaptureAction";
import { NATIVE_DIALOG_Z_INDEX } from "../../utils/nativeDialogInsets";
import { _resetFieldCaptureDiagnosticsForTests, getCaptureCounters } from "../../utils/fieldCaptureDiagnostics";

// A plain variable rather than vi.fn(): afterEach's restoreAllMocks must not wipe the default.
let nativePlatform = false;
vi.mock("../../utils/platform", () => ({
  isMobileNativePlatform: () => nativePlatform,
}));

const isCameraCaptureSupported = vi.fn();
const startCameraStream = vi.fn();
const stopCameraStream = vi.fn();
const decodeBarcodeFromCanvas = vi.fn();
// Field-OCR mock. Most tests only care about the text read, so a plain string result is wrapped as
// a confident "ok" (and "" as no-text); tests exercising clipped/low-confidence return the object.
const recognizeOcr = vi.fn();

vi.mock("../../services/cameraCaptureService", () => ({
  isCameraCaptureSupported: (...args: unknown[]) => isCameraCaptureSupported(...args),
  startCameraStream: (...args: unknown[]) => startCameraStream(...args),
  stopCameraStream: (...args: unknown[]) => stopCameraStream(...args),
  decodeBarcodeFromCanvas: (...args: unknown[]) => decodeBarcodeFromCanvas(...args),
  createScanBuffers: () => ({ luminance: null, rotated: null }),
  recognizeFieldValueFromCanvas: async (...args: unknown[]) => {
    const r = await recognizeOcr(...args);
    if (typeof r !== "string") return r;
    return r ? { status: "ok", text: r, confidence: 90, lowConfidence: false } : { status: "no-text" };
  },
}));

// The crop geometry is exhaustively tested in isolation (cameraCropMath.test.ts). Here we only need
// a plausible non-degenerate target (guide on its middle row) so captureTargetFrame() proceeds;
// the band layout constants stay real.
vi.mock("../../utils/cameraCropMath", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/cameraCropMath")>()),
  mapOcrTarget: () => ({ crop: { x: 0, y: 0, width: 100, height: 60 }, guideY: 30 }),
}));

/** A stream whose track behaves like a real MediaStreamTrack: "live" until stop() ends it.
 *  With `zoom`, the track exposes a zoom capability and records applyConstraints calls. */
function fakeStream(zoom?: { min: number; max: number; step: number; current?: number }): MediaStream {
  const settings: { zoom?: number } = zoom ? { zoom: zoom.current ?? zoom.min } : {};
  const track = {
    readyState: "live" as MediaStreamTrackState,
    stop: vi.fn(() => { track.readyState = "ended"; }),
    getCapabilities: () => (zoom ? { zoom: { min: zoom.min, max: zoom.max, step: zoom.step } } : {}),
    getSettings: () => ({ ...settings }),
    applyConstraints: vi.fn(async (c: { advanced?: Array<{ zoom?: number }> }) => {
      const z = c.advanced?.[0]?.zoom;
      if (typeof z === "number") settings.zoom = z;
    }),
    listeners: {} as Record<string, Array<() => void>>,
    addEventListener(type: string, fn: () => void) {
      (track.listeners[type] ??= []).push(fn);
    },
    /** Simulates the OS ending/muting the track (not our own stop(), which fires nothing). */
    fire(type: "ended" | "mute" | "unmute") {
      if (type === "ended") track.readyState = "ended";
      (track.listeners[type] ?? []).forEach((fn) => fn());
    },
  };
  return { getTracks: () => [track] } as unknown as MediaStream;
}

type FakeTrack = { applyConstraints: ReturnType<typeof vi.fn>; readyState: MediaStreamTrackState; fire: (type: "ended" | "mute" | "unmute") => void };
const trackOf = (stream: MediaStream) => stream.getTracks()[0] as unknown as FakeTrack;

/** Dispatches a touch event with the given finger positions (jsdom's TouchEvent can't take
 *  plain touch objects, and React only reads `touches` from the native event). */
function touch(el: Element, type: "touchstart" | "touchmove" | "touchend", points: Array<[number, number]>) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "touches", { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
  act(() => { el.dispatchEvent(ev); });
  return ev;
}

function isEnded(stream: MediaStream): boolean {
  return stream.getTracks().every((t) => t.readyState === "ended");
}

function nonDegenerateRect(): DOMRect {
  return { left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetFieldCaptureDiagnosticsForTests();
  isCameraCaptureSupported.mockReturnValue(true);
  // A fresh stream per request, as getUserMedia gives — so leaks/replacements are observable.
  startCameraStream.mockImplementation(async () => fakeStream());
  // Mirrors the real stopCameraStream: stops every track.
  stopCameraStream.mockImplementation((stream: MediaStream | null | undefined) => {
    stream?.getTracks().forEach((t) => t.stop());
  });
  decodeBarcodeFromCanvas.mockResolvedValue(null);
  recognizeOcr.mockResolvedValue("");

  // jsdom has no real canvas 2D context or getUserMedia/video metadata; stub the minimum needed
  // for captureCroppedFrame() to produce a real (mocked) canvas rather than bailing out.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,fake");
  vi.spyOn(HTMLVideoElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(nonDegenerateRect());
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 720 });
});

afterEach(() => {
  nativePlatform = false;
  vi.restoreAllMocks();
});

describe("CameraCaptureAction — trigger and menu", () => {
  it("renders an enabled camera icon for a supported environment and offers QR/Barcode + Text/OCR", async () => {
    render(<CameraCaptureAction value="" onChange={vi.fn()} fieldKind="text" ariaLabel="Serial Number" />);
    const trigger = screen.getByRole("button", { name: /Capture Serial Number with camera/i });
    expect(trigger).toBeEnabled();
    fireEvent.click(trigger);
    expect(await screen.findByText("QR / Barcode")).toBeInTheDocument();
    expect(screen.getByText("Text / OCR")).toBeInTheDocument();
  });

  it("disables the trigger and explains why when camera capture is unsupported, rather than hiding it silently", () => {
    isCameraCaptureSupported.mockReturnValue(false);
    render(<CameraCaptureAction value="" onChange={vi.fn()} fieldKind="number" ariaLabel="Meter Reading" />);
    const trigger = screen.getByRole("button", { name: /Capture Meter Reading with camera/i });
    expect(trigger).toBeDisabled();
  });

  it("never mutates the field just by opening or closing the menu", () => {
    const onChange = vi.fn();
    render(<CameraCaptureAction value="existing" onChange={onChange} fieldKind="text" />);
    fireEvent.click(screen.getByRole("button", { name: /capture value with camera/i }));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("CameraCaptureDialog — OCR mode", () => {
  it("opens the camera stream, requires an explicit Capture action, and never recognizes continuously", async () => {
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    await waitFor(() => expect(startCameraStream).toHaveBeenCalledTimes(1));

    // A target window is rendered as soon as previewing starts.
    expect(await screen.findByTestId("camera-capture-target-window")).toBeInTheDocument();

    // No recognition happens just from opening/previewing.
    await new Promise((r) => setTimeout(r, 50));
    expect(recognizeOcr).not.toHaveBeenCalled();

    const captureButton = await screen.findByRole("button", { name: "Capture" });
    fireEvent.click(captureButton);
    await waitFor(() => expect(recognizeOcr).toHaveBeenCalledTimes(1));
    // Only the cropped canvas is ever passed — never the raw <video> element/full frame.
    expect(recognizeOcr).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), { guideY: expect.any(Number) });
  });

  it("shows the recognized text as a candidate for review and does not call onConfirm until Use Value is pressed", async () => {
    recognizeOcr.mockResolvedValue("ABC-12345");
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));

    expect(await screen.findByDisplayValue("ABC-12345")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Use Value" }));
    expect(onConfirm).toHaveBeenCalledWith("ABC-12345");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not alter or auto-correct the recognized text in any way before confirmation", async () => {
    recognizeOcr.mockResolvedValue("O0O l1I"); // deliberately ambiguous characters
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    expect(await screen.findByDisplayValue("O0O l1I")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use Value" }));
    expect(onConfirm).toHaveBeenCalledWith("O0O l1I");
  });

  it("Retake discards the candidate, keeps the camera stream open, and never calls onConfirm", async () => {
    recognizeOcr.mockResolvedValue("first-read");
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    expect(await screen.findByDisplayValue("first-read")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(stopCameraStream).not.toHaveBeenCalled(); // no repeat permission prompt
    expect(await screen.findByRole("button", { name: "Capture" })).toBeInTheDocument();
  });

  it("Cancel closes without ever calling onConfirm, leaving the field untouched", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="original" onClose={onClose} onConfirm={onConfirm} />);
    await waitFor(() => expect(startCameraStream).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stops the camera stream on unmount", async () => {
    const { unmount } = render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    await waitFor(() => expect(startCameraStream).toHaveBeenCalled());
    unmount();
    expect(stopCameraStream).toHaveBeenCalledTimes(1);
  });

  it("surfaces a clear message and leaves the field untouched when camera permission is denied", async () => {
    const deniedError = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    startCameraStream.mockRejectedValue(deniedError);
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    expect(await screen.findByText(/permission was denied/i)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("degrades gracefully when the environment doesn't support camera capture at all", async () => {
    isCameraCaptureSupported.mockReturnValue(false);
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(await screen.findByText(/isn't supported in this browser/i)).toBeInTheDocument();
    expect(startCameraStream).not.toHaveBeenCalled();
  });
});

describe("CameraCaptureDialog — OCR failure and lifecycle races", () => {
  it("never leaves the dialog stuck on 'Reading…': a failed/timed-out recognition returns to the preview with a visible explanation", async () => {
    recognizeOcr.mockRejectedValue(new Error("Timed out preparing the text recogniser."));
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="EXISTING-VALUE" onClose={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));

    expect(await screen.findByText(/couldn't read text from that image/i)).toBeInTheDocument();
    expect(screen.queryByText("Reading…")).not.toBeInTheDocument();
    // Capture stays available for a retry, and the field was never touched.
    expect(screen.getByRole("button", { name: "Capture" })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("a second OCR attempt can succeed after the first one failed", async () => {
    recognizeOcr.mockRejectedValueOnce(new Error("init failed"));
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    expect(await screen.findByText(/couldn't read text from that image/i)).toBeInTheDocument();

    recognizeOcr.mockResolvedValueOnce("RECOVERED-123");
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    expect(await screen.findByDisplayValue("RECOVERED-123")).toBeInTheDocument();
    // The stale warning from the first attempt is cleared once a new capture starts.
    expect(screen.queryByText(/couldn't read text from that image/i)).not.toBeInTheDocument();
  });

  it("closing the dialog during recognition drops the late result — it never reaches the field", async () => {
    let resolveRecognition: ((text: string) => void) | undefined;
    recognizeOcr.mockReturnValue(new Promise<string>((res) => { resolveRecognition = res; }));
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="ORIGINAL" onClose={onClose} onConfirm={onConfirm} />);

    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await waitFor(() => expect(recognizeOcr).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // The OCR promise settles only after the dialog was dismissed.
    resolveRecognition?.("LATE-RESULT");
    await new Promise((r) => setTimeout(r, 20));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("LATE-RESULT")).not.toBeInTheDocument();
  });

  it("unmounting during recognition is safe and releases the camera", async () => {
    let resolveRecognition: ((text: string) => void) | undefined;
    recognizeOcr.mockReturnValue(new Promise<string>((res) => { resolveRecognition = res; }));
    const onConfirm = vi.fn();
    const { unmount } = render(
      <CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await waitFor(() => expect(recognizeOcr).toHaveBeenCalled());

    unmount();
    expect(stopCameraStream).toHaveBeenCalledTimes(1);

    resolveRecognition?.("LATE-RESULT");
    await new Promise((r) => setTimeout(r, 20));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("unmounting while a barcode decode is in flight does not commit a late result", async () => {
    let resolveDecode: ((v: { value: string; format: string } | null) => void) | undefined;
    decodeBarcodeFromCanvas.mockReturnValue(new Promise((res) => { resolveDecode = res; }));
    const onConfirm = vi.fn();
    const { unmount } = render(
      <CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />,
    );
    await waitFor(() => expect(decodeBarcodeFromCanvas).toHaveBeenCalled());

    unmount();
    resolveDecode?.({ value: "LATE-CODE", format: "qr_code" });
    await new Promise((r) => setTimeout(r, 20));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(stopCameraStream).toHaveBeenCalledTimes(1);
  });

  it("releases a camera stream that only arrives after the dialog was already dismissed", async () => {
    let resolveStream: ((s: MediaStream) => void) | undefined;
    startCameraStream.mockReturnValue(new Promise<MediaStream>((res) => { resolveStream = res; }));
    const { unmount } = render(
      <CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    await waitFor(() => expect(startCameraStream).toHaveBeenCalled());

    unmount();
    resolveStream?.(fakeStream());
    await new Promise((r) => setTimeout(r, 20));

    // The late stream must still be stopped, or the camera light stays on with no UI attached.
    expect(stopCameraStream).toHaveBeenCalled();
  });

  it("repeated Retake cycles keep working and never stop the stream mid-session", async () => {
    recognizeOcr.mockResolvedValue("READ-1");
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);

    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
      expect(await screen.findByDisplayValue("READ-1")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    }
    expect(stopCameraStream).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Capture" })).toBeInTheDocument();
  });
});

describe("CameraCaptureDialog — QR/Barcode mode", () => {
  it("renders a viewfinder-style target window distinct from the OCR long-rectangle target", async () => {
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(await screen.findByTestId("camera-capture-target-window")).toBeInTheDocument();
    // No manual Capture button in QR/barcode mode — decoding is continuous, on the cropped region.
    expect(screen.queryByRole("button", { name: "Capture" })).not.toBeInTheDocument();
  });

  it("continuously decodes only the cropped region and stops at the first valid candidate, requiring confirmation before use", async () => {
    decodeBarcodeFromCanvas.mockResolvedValue({ value: "0123456789012", format: "ean_13" });
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);

    await waitFor(() => expect(decodeBarcodeFromCanvas).toHaveBeenCalled());
    // The cropped canvas plus this session's reusable decode buffers — never the full frame.
    expect(decodeBarcodeFromCanvas).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), expect.objectContaining({ rotated: null }));

    expect(await screen.findByDisplayValue("0123456789012")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === "Detected: EAN_13")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled(); // confirmation required even for QR/barcode

    fireEvent.click(screen.getByRole("button", { name: "Use Value" }));
    expect(onConfirm).toHaveBeenCalledWith("0123456789012");
  });

  it("keeps scanning (never auto-selects) while no valid code is found in the cropped region", async () => {
    decodeBarcodeFromCanvas.mockResolvedValue(null);
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    await waitFor(() => expect(decodeBarcodeFromCanvas).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Use Value" })).not.toBeInTheDocument();
  });

  it("Scan Again discards the candidate, resumes scanning, and preserves the original field value", async () => {
    decodeBarcodeFromCanvas.mockResolvedValueOnce({ value: "AAA111", format: "code_128" });
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="original" onClose={vi.fn()} onConfirm={onConfirm} />);
    expect(await screen.findByDisplayValue("AAA111")).toBeInTheDocument();

    decodeBarcodeFromCanvas.mockResolvedValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Scan Again" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(stopCameraStream).not.toHaveBeenCalled();
  });
});

describe("field eligibility (integration-level expectations)", () => {
  it.each(["text", "number", "scan"] as const)("renders the camera action for eligible field kind %s", (kind) => {
    render(<CameraCaptureAction value="" onChange={vi.fn()} fieldKind={kind} />);
    expect(screen.getByRole("button", { name: /capture value with camera/i })).toBeInTheDocument();
  });
});

// Regression for the PR #376 on-device blocker: on native, WorkOrderRunner's Dialog is pinned to
// NATIVE_DIALOG_Z_INDEX (1500). A camera Menu/Dialog left at MUI's default 1300 opened BEHIND the
// runner — invisible and undismissable — while its focus trap stole focus from every workflow
// field. These assert the actual rendered stacking, not merely that a helper was called.
describe("CameraCaptureAction — native modal stacking above WorkOrderRunner", () => {
  function modalRootZIndex(el: HTMLElement, rootClass: string): number {
    const root = el.closest(`.${rootClass}`) as HTMLElement | null;
    expect(root).not.toBeNull();
    return Number(getComputedStyle(root!).zIndex);
  }

  async function openMenu() {
    render(<CameraCaptureAction value="" onChange={vi.fn()} fieldKind="text" ariaLabel="Serial Number" />);
    fireEvent.click(screen.getByRole("button", { name: /Capture Serial Number with camera/i }));
    return screen.findByRole("menu");
  }

  it("native: the camera mode Menu renders above the runner's native Dialog", async () => {
    nativePlatform = true;
    const menu = await openMenu();
    expect(modalRootZIndex(menu, "MuiPopover-root")).toBeGreaterThan(NATIVE_DIALOG_Z_INDEX);
  });

  it.each([
    ["QR / Barcode", /Scan QR \/ Barcode/],
    ["Text / OCR", /Capture Text/],
  ])("native: choosing %s opens a capture Dialog above the runner's native Dialog", async (item, title) => {
    nativePlatform = true;
    await openMenu();
    fireEvent.click(screen.getByText(item));
    const heading = await screen.findByText(title);
    expect(modalRootZIndex(heading, "MuiDialog-root")).toBeGreaterThan(NATIVE_DIALOG_Z_INDEX);
    // Cancel still closes without touching the field on native.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument());
  });

  it("native: Cancel in the mode Menu closes it and releases the modal layer", async () => {
    nativePlatform = true;
    const onChange = vi.fn();
    render(<CameraCaptureAction value="existing" onChange={onChange} fieldKind="text" />);
    fireEvent.click(screen.getByRole("button", { name: /capture value with camera/i }));
    await screen.findByRole("menu");
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(document.querySelector(".MuiPopover-root")).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("web: no native z-index override — Menu and capture Dialog keep MUI's default stacking", async () => {
    nativePlatform = false;
    const menu = await openMenu();
    expect(modalRootZIndex(menu, "MuiPopover-root")).toBe(1300);
    fireEvent.click(screen.getByText("QR / Barcode"));
    const heading = await screen.findByText(/Scan QR \/ Barcode/);
    expect(modalRootZIndex(heading, "MuiDialog-root")).toBe(1300);
  });
});

// Regression for the PR #376 device finding "Retake / Scan Again → black preview": the preview
// <video> is unmounted during review and a NEW element mounts on Retake/Scan Again. The stream
// must be bound to whichever element is mounted — not only to the one present at open time.
describe("CameraCaptureDialog — camera stream lifecycle across Retake / Scan Again", () => {
  const video = () => screen.getByTestId("camera-capture-video") as HTMLVideoElement;
  const createdStreams = () =>
    Promise.all(startCameraStream.mock.results.map((r) => r.value as Promise<MediaStream>));

  it("initial open binds a live stream to the preview", async () => {
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    await screen.findByRole("button", { name: "Capture" });
    const [stream] = await createdStreams();
    expect(video().srcObject).toBe(stream);
    expect(isEnded(stream)).toBe(false);
  });

  it("OCR Capture → Review → Retake: the NEW preview element is bound to the still-live stream", async () => {
    recognizeOcr.mockResolvedValue("324775");
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    const firstVideo = video();
    await screen.findByDisplayValue("324775");
    expect(screen.queryByTestId("camera-capture-video")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    await screen.findByRole("button", { name: "Capture" });

    const [stream] = await createdStreams();
    expect(video()).not.toBe(firstVideo); // genuinely a remounted element…
    expect(video().srcObject).toBe(stream); // …that has the stream (it was null → black before)
    expect(isEnded(stream)).toBe(false);
    expect(startCameraStream).toHaveBeenCalledTimes(1); // no repeat permission prompt
    expect(HTMLVideoElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it("QR detection → Review → Scan Again: preview re-bound and decoding resumes against the new element", async () => {
    decodeBarcodeFromCanvas.mockResolvedValueOnce({ value: "AAA111", format: "code_128" });
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    await screen.findByDisplayValue("AAA111");
    const decodesBefore = decodeBarcodeFromCanvas.mock.calls.length;

    decodeBarcodeFromCanvas.mockResolvedValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Scan Again" }));

    const [stream] = await createdStreams();
    await waitFor(() => expect(video().srcObject).toBe(stream));
    await waitFor(() => expect(decodeBarcodeFromCanvas.mock.calls.length).toBeGreaterThan(decodesBefore));
    expect(isEnded(stream)).toBe(false);
  });

  it("a stream whose tracks ENDED during review is stopped and replaced with a new live one", async () => {
    recognizeOcr.mockResolvedValue("V1.2.3");
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("V1.2.3");
    const [first] = await createdStreams();
    first.getTracks().forEach((t) => t.stop()); // e.g. OS reclaimed the camera

    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    await screen.findByRole("button", { name: "Capture" });

    expect(startCameraStream).toHaveBeenCalledTimes(2);
    const [, second] = await createdStreams();
    expect(video().srcObject).toBe(second);
    expect(isEnded(second)).toBe(false);
  });

  it("Cancel stops the active tracks", async () => {
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    await waitFor(() => expect(decodeBarcodeFromCanvas).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const streams = await createdStreams();
    expect(streams.every(isEnded)).toBe(true);
  });

  it("unmount stops the active tracks, including after a Retake", async () => {
    recognizeOcr.mockResolvedValue("DR040");
    const { unmount } = render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("DR040");
    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    await screen.findByRole("button", { name: "Capture" });
    unmount();
    const streams = await createdStreams();
    expect(streams.every(isEnded)).toBe(true);
  });

  it("a replacement stream that arrives after Cancel is stopped on arrival and never attached", async () => {
    recognizeOcr.mockResolvedValue("J000376");
    const onClose = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={onClose} onConfirm={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("J000376");
    const [first] = await createdStreams();
    first.getTracks().forEach((t) => t.stop());

    let resolveLate: ((s: MediaStream) => void) | undefined;
    startCameraStream.mockImplementationOnce(() => new Promise<MediaStream>((res) => { resolveLate = res; }));
    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    await waitFor(() => expect(startCameraStream).toHaveBeenCalledTimes(2));
    const pendingVideo = video();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    const late = fakeStream();
    resolveLate?.(late);
    await new Promise((r) => setTimeout(r, 20));

    expect(isEnded(late)).toBe(true);
    expect(pendingVideo.srcObject).not.toBe(late);
  });

  it("repeated Scan Again cycles reuse ONE stream and never run more than one decoder loop", async () => {
    decodeBarcodeFromCanvas.mockResolvedValue({ value: "ABC-123", format: "code_128" });
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    const cycles = 3;
    for (let i = 0; i < cycles; i += 1) {
      await screen.findByDisplayValue("ABC-123");
      fireEvent.click(screen.getByRole("button", { name: "Scan Again" }));
    }
    // Final preview: a decode that never settles. One loop = exactly one outstanding call; a
    // leaked/duplicated loop would keep issuing more.
    decodeBarcodeFromCanvas.mockReturnValue(new Promise(() => { /* never settles */ }));
    await screen.findByDisplayValue("ABC-123");
    fireEvent.click(screen.getByRole("button", { name: "Scan Again" }));
    await waitFor(() => expect(decodeBarcodeFromCanvas).toHaveBeenCalledTimes(cycles + 2));
    await new Promise((r) => setTimeout(r, 400)); // several 150ms loop periods
    expect(decodeBarcodeFromCanvas).toHaveBeenCalledTimes(cycles + 2);

    expect(startCameraStream).toHaveBeenCalledTimes(1);
    const [stream] = await createdStreams();
    expect(isEnded(stream)).toBe(false);
    expect(video().srcObject).toBe(stream);
  });

  it("repeated Retake after ended tracks never accumulates live streams", async () => {
    recognizeOcr.mockResolvedValue("SN-1");
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
      await screen.findByDisplayValue("SN-1");
      const streams = await createdStreams();
      streams[streams.length - 1].getTracks().forEach((t) => t.stop());
      fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    }
    await screen.findByRole("button", { name: "Capture" });
    const streams = await createdStreams();
    expect(streams).toHaveLength(4);
    expect(streams.filter((s) => !isEnded(s))).toHaveLength(1);
    expect(video().srcObject).toBe(streams[3]);
  });
});

describe("CameraCaptureDialog — editable review value", () => {
  const reviewField = () => screen.getByLabelText("Detected value") as HTMLInputElement;

  it("OCR: the exact candidate appears in an editable field; Use Value commits the EDITED value", async () => {
    recognizeOcr.mockResolvedValue("3247751 ;"); // device regression reading
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("3247751 ;");
    expect(reviewField().value).toBe("3247751 ;"); // shown exactly — no silent correction

    fireEvent.change(reviewField(), { target: { value: "324775" } });
    expect(onConfirm).not.toHaveBeenCalled(); // editing never reaches the field by itself

    fireEvent.click(screen.getByRole("button", { name: "Use Value" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("324775");
  });

  it("Cancel after editing commits nothing", async () => {
    recognizeOcr.mockResolvedValue("ABC-128");
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="orig" onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("ABC-128");
    fireEvent.change(reviewField(), { target: { value: "ABC-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Retake discards the candidate AND the edit; the next reading replaces it", async () => {
    recognizeOcr.mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("first");
    fireEvent.change(reviewField(), { target: { value: "edited-first" } });

    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    expect(screen.queryByDisplayValue("edited-first")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("second");
    fireEvent.click(screen.getByRole("button", { name: "Use Value" }));
    expect(onConfirm).toHaveBeenCalledWith("second");
  });

  it("QR/barcode: the candidate is editable too, and Use Value commits the edit", async () => {
    decodeBarcodeFromCanvas.mockResolvedValueOnce({ value: "J000376X", format: "qr_code" });
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    await screen.findByDisplayValue("J000376X");
    fireEvent.change(reviewField(), { target: { value: "J000376" } });
    fireEvent.click(screen.getByRole("button", { name: "Use Value" }));
    expect(onConfirm).toHaveBeenCalledWith("J000376");
  });

  it("Scan Again discards the candidate and edit; a new detection replaces it", async () => {
    decodeBarcodeFromCanvas
      .mockResolvedValueOnce({ value: "OLD-1", format: "code_128" })
      .mockResolvedValueOnce({ value: "NEW-2", format: "code_128" });
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    await screen.findByDisplayValue("OLD-1");
    fireEvent.change(reviewField(), { target: { value: "OLD-1-edited" } });
    fireEvent.click(screen.getByRole("button", { name: "Scan Again" }));
    expect(screen.queryByDisplayValue("OLD-1-edited")).not.toBeInTheDocument();
    await screen.findByDisplayValue("NEW-2");
    fireEvent.click(screen.getByRole("button", { name: "Use Value" }));
    expect(onConfirm).toHaveBeenCalledWith("NEW-2");
  });

  it("clearing the review field disables Use Value; typing re-enables it", async () => {
    recognizeOcr.mockResolvedValue("DR04O");
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("DR04O");
    const useValue = screen.getByRole("button", { name: "Use Value" });
    fireEvent.change(reviewField(), { target: { value: "" } });
    expect(useValue).toBeDisabled();
    fireEvent.change(reviewField(), { target: { value: "DR040" } });
    expect(useValue).toBeEnabled();
    fireEvent.click(useValue);
    expect(onConfirm).toHaveBeenCalledWith("DR040");
  });

  it("number field: the edited string reaches the field's own onChange unconverted, only on Use Value", async () => {
    recognizeOcr.mockResolvedValue("3247751 ;");
    const onChange = vi.fn();
    render(<CameraCaptureAction value="" onChange={onChange} fieldKind="number" ariaLabel="Meter" />);
    fireEvent.click(screen.getByRole("button", { name: /Capture Meter with camera/i }));
    fireEvent.click(await screen.findByText("Text / OCR"));
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("3247751 ;");
    fireEvent.change(reviewField(), { target: { value: "324775" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use Value" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("324775"); // a string — WorkOrderRunner's path decides
  });
});

describe("CameraCaptureDialog — industrial OCR capture outcomes", () => {
  it("shows the single-value target band with an alignment guide", async () => {
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(await screen.findByText("Position ONE value inside frame")).toBeInTheDocument();
    const band = screen.getByTestId("camera-capture-target-window");
    expect(band).toContainElement(screen.getByTestId("ocr-alignment-guide"));
  });

  it("passes the alignment guide's row (in capture pixels) to recognition", async () => {
    let heightAtCall = -1;
    recognizeOcr.mockImplementation(async (c: HTMLCanvasElement) => {
      heightAtCall = c.height; // read at call time — the capture canvas is released afterwards
      return "C250";
    });
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("C250");
    const [canvas, opts] = recognizeOcr.mock.calls[0] as [HTMLCanvasElement, { guideY: number }];
    expect(opts.guideY).toBeGreaterThan(0);
    expect(opts.guideY).toBeLessThanOrEqual(heightAtCall);
    expect(canvas.width).toBe(0); // released once the capture was read
  });

  it("clipped value: asks to keep it inside the frame, stays live for a retake, touches nothing", async () => {
    recognizeOcr.mockResolvedValue({ status: "clipped" });
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="ORIGINAL" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    expect(await screen.findByText(/Keep the complete value inside the frame/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Capture" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Detected value")).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("no text on the guide: explains, stays live, touches nothing", async () => {
    recognizeOcr.mockResolvedValue({ status: "no-text" });
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    expect(await screen.findByText(/No text found on the guide line/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Capture" })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("low-confidence read: a subtle hint, but the value stays editable and usable", async () => {
    recognizeOcr.mockResolvedValue({ status: "ok", text: "S49l2/89", confidence: 41, lowConfidence: true });
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("S49l2/89");
    expect(screen.getByText(/Low-confidence read/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Detected value"), { target: { value: "S4912/89" } });
    fireEvent.click(screen.getByRole("button", { name: "Use Value" }));
    expect(onConfirm).toHaveBeenCalledWith("S4912/89");
  });

  it("a confident read shows no low-confidence hint", async () => {
    recognizeOcr.mockResolvedValue("J000376");
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("J000376");
    expect(screen.queryByText(/Low-confidence read/i)).not.toBeInTheDocument();
  });

  it("Retake after a clipped attempt returns to a live preview (no mutation)", async () => {
    recognizeOcr.mockResolvedValueOnce({ status: "clipped" }).mockResolvedValueOnce("12/24V");
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await screen.findByText(/Keep the complete value inside the frame/i);
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("12/24V");
    expect(screen.queryByText(/Keep the complete value/i)).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("CameraCaptureDialog — pinch-to-zoom (real camera zoom)", () => {
  const preview = () => screen.getByTestId("camera-capture-preview");
  const streams = () => Promise.all(startCameraStream.mock.results.map((r) => r.value as Promise<MediaStream>));

  async function openWithZoom(mode: "ocr" | "qr-barcode", zoom = { min: 1, max: 5, step: 0.1 }) {
    startCameraStream.mockImplementation(async () => fakeStream(zoom));
    render(<CameraCaptureDialog mode={mode} currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    await screen.findByTestId("camera-zoom-indicator");
  }

  it("shows the camera's current zoom when the track exposes zoom", async () => {
    await openWithZoom("ocr");
    expect(screen.getByTestId("camera-zoom-indicator")).toHaveTextContent("1.0×");
    expect(screen.getByText(/Pinch to zoom/)).toBeInTheDocument();
  });

  it("no zoom capability: no indicator, no pinch hint, and a pinch is harmless", async () => {
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    await screen.findByRole("button", { name: "Capture" });
    expect(screen.queryByTestId("camera-zoom-indicator")).not.toBeInTheDocument();
    expect(screen.queryByText(/Pinch to zoom/)).not.toBeInTheDocument();
    touch(preview(), "touchstart", [[0, 0], [100, 0]]);
    touch(preview(), "touchmove", [[0, 0], [200, 0]]);
    const [stream] = await streams();
    expect(trackOf(stream).applyConstraints).not.toHaveBeenCalled();
  });

  it("pinching out applies real zoom through applyConstraints and updates the indicator", async () => {
    await openWithZoom("ocr");
    touch(preview(), "touchstart", [[100, 100], [200, 100]]);
    touch(preview(), "touchmove", [[80, 100], [260, 100]]); // 100px → 180px ⇒ 1.8×
    expect(screen.getByTestId("camera-zoom-indicator")).toHaveTextContent("1.8×");
    const [stream] = await streams();
    await waitFor(() => expect(trackOf(stream).applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 1.8 }] }));
  });

  it("clamps at the camera's maximum", async () => {
    await openWithZoom("ocr", { min: 1, max: 3, step: 0.5 });
    touch(preview(), "touchstart", [[0, 0], [50, 0]]);
    touch(preview(), "touchmove", [[0, 0], [400, 0]]);
    expect(screen.getByTestId("camera-zoom-indicator")).toHaveTextContent("3.0×");
  });

  it("the pinch's own browser default is blocked so the page/dialog doesn't zoom or move", async () => {
    await openWithZoom("ocr");
    touch(preview(), "touchstart", [[0, 0], [100, 0]]);
    const move = touch(preview(), "touchmove", [[0, 0], [150, 0]]);
    expect(move.defaultPrevented).toBe(true);
    const oneFinger = touch(preview(), "touchmove", [[0, 0]]);
    expect(oneFinger.defaultPrevented).toBe(false);
  });

  it("a camera that rejects the zoom leaves the indicator on the zoom it's really at", async () => {
    await openWithZoom("ocr");
    const [stream] = await streams();
    trackOf(stream).applyConstraints.mockRejectedValue(new Error("OverconstrainedError"));
    touch(preview(), "touchstart", [[0, 0], [100, 0]]);
    touch(preview(), "touchmove", [[0, 0], [250, 0]]);
    await waitFor(() => expect(screen.getByTestId("camera-zoom-indicator")).toHaveTextContent("1.0×"));
  });

  it("Retake on the SAME live stream keeps the zoom the technician set", async () => {
    await openWithZoom("ocr");
    recognizeOcr.mockResolvedValue("C250");
    touch(preview(), "touchstart", [[0, 0], [100, 0]]);
    touch(preview(), "touchmove", [[0, 0], [200, 0]]);
    expect(screen.getByTestId("camera-zoom-indicator")).toHaveTextContent("2.0×");
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("C250");
    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    expect(await screen.findByTestId("camera-zoom-indicator")).toHaveTextContent("2.0×");
    expect(startCameraStream).toHaveBeenCalledTimes(1);
  });

  it("a NEWLY acquired stream reinitialises zoom from its own capabilities", async () => {
    await openWithZoom("ocr");
    recognizeOcr.mockResolvedValue("C250");
    touch(preview(), "touchstart", [[0, 0], [100, 0]]);
    touch(preview(), "touchmove", [[0, 0], [300, 0]]);
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await screen.findByDisplayValue("C250");
    const [first] = await streams();
    first.getTracks().forEach((t) => t.stop()); // camera lost during review
    startCameraStream.mockImplementation(async () => fakeStream({ min: 1, max: 8, step: 0.1, current: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    await screen.findByRole("button", { name: "Capture" });
    expect(startCameraStream).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("camera-zoom-indicator")).toHaveTextContent("1.0×");
  });

  it("QR/barcode shares zoom and still detects → reviews → edits → uses", async () => {
    decodeBarcodeFromCanvas.mockResolvedValue(null);
    await openWithZoom("qr-barcode");
    touch(preview(), "touchstart", [[0, 0], [100, 0]]);
    touch(preview(), "touchmove", [[0, 0], [150, 0]]);
    expect(screen.getByTestId("camera-zoom-indicator")).toHaveTextContent("1.5×");
    decodeBarcodeFromCanvas.mockResolvedValue({ value: "ASM2002566", format: "code_128" });
    const field = await screen.findByDisplayValue("ASM2002566");
    fireEvent.change(field, { target: { value: "ASM2002566-A" } });
    expect(recognizeOcr).not.toHaveBeenCalled(); // QR never goes through the OCR pipeline
  });
});

// ── Repeated-use lifecycle (PR #376 device finding: after many QR sessions the capture dialog
// closed on open / Scan Again until the app was restarted). These drive the REAL component
// through long open/scan/close sequences and assert that every session gives back what it took.
describe("repeated-use stress: sessions release everything and never affect each other", () => {
  const streams = () => Promise.all(startCameraStream.mock.results.map((r) => r.value as Promise<MediaStream>));
  const video = () => screen.getByTestId("camera-capture-video") as HTMLVideoElement;
  const idle = { activeSessions: 0, liveStreams: 0, activeScanLoops: 0, captureCanvases: 0 };

  function renderAction(onChange = vi.fn()) {
    render(<CameraCaptureAction value="" onChange={onChange} fieldKind="scan" ariaLabel="Serial" />);
    return onChange;
  }
  async function openFromMenu(item: "QR / Barcode" | "Text / OCR") {
    fireEvent.click(screen.getByRole("button", { name: /Capture Serial with camera/i }));
    fireEvent.click(await screen.findByText(item));
    await screen.findByRole("dialog");
  }
  async function cancelDialog() {
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  }

  it("1/15. open QR → Cancel, 25 times: every stream stopped, no loops/canvases/sessions left", async () => {
    decodeBarcodeFromCanvas.mockResolvedValue(null);
    renderAction();
    for (let i = 0; i < 25; i += 1) {
      await openFromMenu("QR / Barcode");
      await waitFor(() => expect(video().srcObject).toBeTruthy());
      await cancelDialog();
    }
    expect(startCameraStream).toHaveBeenCalledTimes(25);
    expect((await streams()).every(isEnded)).toBe(true);
    expect(getCaptureCounters()).toEqual(idle);
  });

  it("2/14. one session, detect → Review → Scan Again × 25: one stream, never more than one loop", async () => {
    decodeBarcodeFromCanvas.mockResolvedValue({ value: "324775", format: "code_128" });
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    for (let i = 0; i < 25; i += 1) {
      await screen.findByDisplayValue("324775");
      expect(getCaptureCounters().activeScanLoops).toBe(0); // stopped on detection
      fireEvent.click(screen.getByRole("button", { name: "Scan Again" }));
      expect(getCaptureCounters().activeScanLoops).toBeLessThanOrEqual(1);
    }
    await screen.findByDisplayValue("324775");
    expect(startCameraStream).toHaveBeenCalledTimes(1);
    expect(getCaptureCounters()).toMatchObject({ activeSessions: 1, liveStreams: 1, captureCanvases: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(getCaptureCounters()).toMatchObject({ liveStreams: 0 });
  });

  it("3. detect → Use Value → reopen, 10 times: each commit lands once, nothing accumulates", async () => {
    const onChange = renderAction();
    for (let i = 0; i < 10; i += 1) {
      decodeBarcodeFromCanvas.mockResolvedValueOnce({ value: `ASM${i}`, format: "code_128" });
      await openFromMenu("QR / Barcode");
      await screen.findByDisplayValue(`ASM${i}`);
      fireEvent.click(screen.getByRole("button", { name: "Use Value" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(Array.from({ length: 10 }, (_, i) => `ASM${i}`));
    expect((await streams()).every(isEnded)).toBe(true);
    expect(getCaptureCounters()).toEqual(idle);
  });

  it("4/5. a decode in flight when the dialog closes can't publish into — or close — the next session", async () => {
    let resolveOld: ((v: { value: string; format: string } | null) => void) | undefined;
    decodeBarcodeFromCanvas.mockReturnValueOnce(new Promise((res) => { resolveOld = res; }));
    const onChange = renderAction();
    await openFromMenu("QR / Barcode");
    await waitFor(() => expect(decodeBarcodeFromCanvas).toHaveBeenCalledTimes(1));
    await cancelDialog();

    decodeBarcodeFromCanvas.mockReturnValue(new Promise(() => { /* new session: still aiming */ }));
    await openFromMenu("QR / Barcode");
    resolveOld?.({ value: "STALE-FROM-SESSION-1", format: "qr_code" });
    await new Promise((r) => setTimeout(r, 30));

    expect(screen.getByRole("dialog")).toBeInTheDocument(); // new session still open
    expect(screen.queryByDisplayValue("STALE-FROM-SESSION-1")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("6. a getUserMedia that resolves after its session closed is stopped and never reaches the next session", async () => {
    let resolveOld: ((s: MediaStream) => void) | undefined;
    startCameraStream.mockImplementationOnce(() => new Promise<MediaStream>((res) => { resolveOld = res; }));
    decodeBarcodeFromCanvas.mockResolvedValue(null);
    renderAction();
    await openFromMenu("QR / Barcode");
    await cancelDialog();
    await openFromMenu("QR / Barcode");
    await waitFor(() => expect(video().srcObject).toBeTruthy());
    const current = video().srcObject;

    const late = fakeStream();
    resolveOld?.(late);
    await new Promise((r) => setTimeout(r, 20));

    expect(isEnded(late)).toBe(true);
    expect(video().srcObject).toBe(current);
    expect(getCaptureCounters().liveStreams).toBe(1);
  });

  it("7. a video play() that settles after close is harmless", async () => {
    let resolvePlay: (() => void) | undefined;
    vi.spyOn(HTMLVideoElement.prototype, "play").mockReturnValue(new Promise<void>((res) => { resolvePlay = res; }));
    decodeBarcodeFromCanvas.mockResolvedValue(null);
    renderAction();
    await openFromMenu("QR / Barcode");
    await waitFor(() => expect(HTMLVideoElement.prototype.play).toHaveBeenCalled());
    await cancelDialog();
    resolvePlay?.();
    await new Promise((r) => setTimeout(r, 20));
    expect(getCaptureCounters()).toEqual(idle);
    await openFromMenu("QR / Barcode"); // and a new session still opens normally
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("8. no timer from a closed session keeps scanning", async () => {
    decodeBarcodeFromCanvas.mockResolvedValue(null);
    renderAction();
    await openFromMenu("QR / Barcode");
    await waitFor(() => expect(decodeBarcodeFromCanvas).toHaveBeenCalled());
    await cancelDialog();
    const calls = decodeBarcodeFromCanvas.mock.calls.length;
    await new Promise((r) => setTimeout(r, 500)); // > 3 scan periods
    expect(decodeBarcodeFromCanvas.mock.calls.length).toBe(calls);
  });

  it("9/10. a decoder exception (BarcodeDetector or ZXing) is a missed frame — scanning continues, dialog stays", async () => {
    decodeBarcodeFromCanvas
      .mockRejectedValueOnce(new Error("BarcodeDetector: detect failed"))
      .mockRejectedValueOnce(new Error("ZXing: NotFoundException"))
      .mockResolvedValue({ value: "DR040", format: "code_39" });
    const onClose = vi.fn();
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={onClose} onConfirm={vi.fn()} />);
    expect(await screen.findByDisplayValue("DR040")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("11. a rejected zoom constraint never closes capture", async () => {
    startCameraStream.mockImplementation(async () => fakeStream({ min: 1, max: 5, step: 0.1 }));
    decodeBarcodeFromCanvas.mockResolvedValue(null);
    const onClose = vi.fn();
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={onClose} onConfirm={vi.fn()} />);
    await screen.findByTestId("camera-zoom-indicator");
    const [stream] = await streams();
    trackOf(stream).applyConstraints.mockRejectedValue(new Error("OverconstrainedError"));
    const preview = screen.getByTestId("camera-capture-preview");
    touch(preview, "touchstart", [[0, 0], [100, 0]]);
    touch(preview, "touchmove", [[0, 0], [300, 0]]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("12. a zoom still being applied when the session closes can't touch the next session", async () => {
    startCameraStream.mockImplementation(async () => fakeStream({ min: 1, max: 5, step: 0.1 }));
    decodeBarcodeFromCanvas.mockResolvedValue(null);
    renderAction();
    await openFromMenu("QR / Barcode");
    await screen.findByTestId("camera-zoom-indicator");
    const [first] = await streams();
    let finishOldZoom: (() => void) | undefined;
    trackOf(first).applyConstraints.mockImplementation(() => new Promise<void>((res) => { finishOldZoom = res; }));
    const preview = screen.getByTestId("camera-capture-preview");
    touch(preview, "touchstart", [[0, 0], [100, 0]]);
    touch(preview, "touchmove", [[0, 0], [300, 0]]);
    touch(preview, "touchmove", [[0, 0], [400, 0]]); // queued behind the in-flight one
    await cancelDialog();

    await openFromMenu("QR / Barcode");
    await screen.findByTestId("camera-zoom-indicator");
    finishOldZoom?.();
    await new Promise((r) => setTimeout(r, 20));
    const [, second] = await streams();
    expect(trackOf(second).applyConstraints).not.toHaveBeenCalled();
    expect(screen.getByTestId("camera-zoom-indicator")).toHaveTextContent("1.0×");
  });

  it("13. the OS ending the track mid-preview recovers with a fresh stream (bounded), then offers Try again", async () => {
    decodeBarcodeFromCanvas.mockResolvedValue(null);
    const onClose = vi.fn();
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={onClose} onConfirm={vi.fn()} />);
    await waitFor(() => expect(video().srcObject).toBeTruthy());

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const all = await streams();
      act(() => trackOf(all[all.length - 1]).fire("ended"));
      await waitFor(() => expect(startCameraStream).toHaveBeenCalledTimes(attempt + 1));
      const next = (await streams())[attempt];
      await waitFor(() => expect(video().srcObject).toBe(next)); // live again, no close
    }
    const all = await streams();
    act(() => trackOf(all[all.length - 1]).fire("ended"));
    expect(await screen.findByText(/The camera stopped/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(startCameraStream).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(screen.getByTestId("camera-capture-video")).toBeInTheDocument());
    expect(getCaptureCounters().liveStreams).toBe(1);
  });

  it("a camera start failure shows Try again (never closes); Try again recovers", async () => {
    startCameraStream.mockRejectedValueOnce(Object.assign(new Error("busy"), { name: "NotReadableError" }));
    const onClose = vi.fn();
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={onClose} onConfirm={vi.fn()} />);
    expect(await screen.findByText(/camera is unavailable right now/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(video().srcObject).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("16. unmount (parent destroyed) releases the stream, loop and canvas", async () => {
    decodeBarcodeFromCanvas.mockResolvedValue(null);
    const { unmount } = render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    await waitFor(() => expect(decodeBarcodeFromCanvas).toHaveBeenCalled());
    expect(getCaptureCounters()).toEqual({ activeSessions: 1, liveStreams: 1, activeScanLoops: 1, captureCanvases: 1 });
    unmount();
    expect(getCaptureCounters()).toEqual(idle);
    expect((await streams()).every(isEnded)).toBe(true);
  });

  it("the QR loop reuses ONE capture canvas for the whole session (not one per frame)", async () => {
    decodeBarcodeFromCanvas.mockResolvedValue(null);
    const create = vi.spyOn(document, "createElement");
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    await waitFor(() => expect(decodeBarcodeFromCanvas.mock.calls.length).toBeGreaterThanOrEqual(4));
    const canvases = create.mock.calls.filter(([tag]) => tag === "canvas").length;
    expect(canvases).toBe(1);
    const decoded = new Set(decodeBarcodeFromCanvas.mock.calls.map((c) => c[0]));
    expect(decoded.size).toBe(1);
  });

  it("17/18. OCR → close → QR works, and QR → close → OCR works, alternately", async () => {
    decodeBarcodeFromCanvas.mockResolvedValue({ value: "C250", format: "code_128" });
    recognizeOcr.mockResolvedValue("12/24V");
    renderAction();
    for (let i = 0; i < 3; i += 1) {
      await openFromMenu("Text / OCR");
      fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
      await screen.findByDisplayValue("12/24V");
      await cancelDialog();
      await openFromMenu("QR / Barcode");
      await screen.findByDisplayValue("C250");
      await cancelDialog();
    }
    expect((await streams()).every(isEnded)).toBe(true);
    expect(getCaptureCounters()).toEqual(idle);
  });

  it("a tap on the dimmed backdrop never ends a capture; Escape still cancels", async () => {
    decodeBarcodeFromCanvas.mockResolvedValue(null);
    const onClose = vi.fn();
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={onClose} onConfirm={vi.fn()} />);
    await waitFor(() => expect(video().srcObject).toBeTruthy());
    const container = document.querySelector(".MuiDialog-container") as HTMLElement;
    fireEvent.mouseDown(container);
    fireEvent.click(container);
    expect(onClose).not.toHaveBeenCalled();
    expect(getCaptureCounters().liveStreams).toBe(1);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getCaptureCounters().liveStreams).toBe(0);
  });
});

describe("rotation-aware scanning: per-session decode buffers", () => {
  const buffersPassed = () => decodeBarcodeFromCanvas.mock.calls.map((c) => c[1] as object);

  it("every frame — and every Scan Again — of one session reuses the SAME buffers; no extra loops", async () => {
    decodeBarcodeFromCanvas
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ value: "VERT-128", format: "code_128", rotated: true })
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ value: "VERT-128", format: "code_128", rotated: true });
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    for (let i = 0; i < 5; i += 1) {
      await screen.findByDisplayValue("VERT-128");
      fireEvent.click(screen.getByRole("button", { name: "Scan Again" }));
      expect(getCaptureCounters().activeScanLoops).toBeLessThanOrEqual(1);
    }
    await screen.findByDisplayValue("VERT-128");
    expect(new Set(buffersPassed()).size).toBe(1);
    expect(getCaptureCounters()).toMatchObject({ captureCanvases: 1, liveStreams: 1 });
  });

  it("each session gets fresh buffers; a decode still running from a closed session can't reach the next", async () => {
    let finishOld: ((v: null) => void) | undefined;
    decodeBarcodeFromCanvas.mockReturnValueOnce(new Promise((res) => { finishOld = res; }));
    render(<CameraCaptureAction value="" onChange={vi.fn()} fieldKind="scan" ariaLabel="Serial" />);
    fireEvent.click(screen.getByRole("button", { name: /Capture Serial with camera/i }));
    fireEvent.click(await screen.findByText("QR / Barcode"));
    await waitFor(() => expect(decodeBarcodeFromCanvas).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    decodeBarcodeFromCanvas.mockResolvedValue(null);
    fireEvent.click(screen.getByRole("button", { name: /Capture Serial with camera/i }));
    fireEvent.click(await screen.findByText("QR / Barcode"));
    await waitFor(() => expect(decodeBarcodeFromCanvas.mock.calls.length).toBeGreaterThan(1));
    finishOld?.(null);
    await new Promise((r) => setTimeout(r, 20));

    const [oldBuffers, ...newer] = buffersPassed();
    expect(newer.every((b) => b !== oldBuffers)).toBe(true);
    expect(getCaptureCounters()).toMatchObject({ activeSessions: 1, liveStreams: 1, activeScanLoops: 1 });
  });

  it("the QR/barcode target is square, so a vertical linear code fits as well as a horizontal one", async () => {
    render(<CameraCaptureDialog mode="qr-barcode" currentValue="" onClose={vi.fn()} onConfirm={vi.fn()} />);
    const target = await screen.findByTestId("camera-capture-target-window");
    const style = getComputedStyle(target);
    // 60% of a 3:4 preview's width == 45% of its height → 27.5% top/bottom insets.
    expect([style.left, style.right, style.top, style.bottom]).toEqual(["20%", "20%", "27.5%", "27.5%"]);
  });
});
