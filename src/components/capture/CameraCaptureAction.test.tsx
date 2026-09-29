import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CameraCaptureAction, CameraCaptureDialog } from "./CameraCaptureAction";
import { NATIVE_DIALOG_Z_INDEX } from "../../utils/nativeDialogInsets";

// A plain variable rather than vi.fn(): afterEach's restoreAllMocks must not wipe the default.
let nativePlatform = false;
vi.mock("../../utils/platform", () => ({
  isMobileNativePlatform: () => nativePlatform,
}));

const isCameraCaptureSupported = vi.fn();
const startCameraStream = vi.fn();
const stopCameraStream = vi.fn();
const decodeBarcodeFromCanvas = vi.fn();
const recognizeTextFromCanvas = vi.fn();

vi.mock("../../services/cameraCaptureService", () => ({
  isCameraCaptureSupported: (...args: unknown[]) => isCameraCaptureSupported(...args),
  startCameraStream: (...args: unknown[]) => startCameraStream(...args),
  stopCameraStream: (...args: unknown[]) => stopCameraStream(...args),
  decodeBarcodeFromCanvas: (...args: unknown[]) => decodeBarcodeFromCanvas(...args),
  recognizeTextFromCanvas: (...args: unknown[]) => recognizeTextFromCanvas(...args),
}));

// computeSourceCropRect is exhaustively tested in isolation (cameraCropMath.test.ts). Here we only
// need it to return a plausible non-degenerate rect so captureCroppedFrame() proceeds.
vi.mock("../../utils/cameraCropMath", () => ({
  computeSourceCropRect: () => ({ x: 0, y: 0, width: 100, height: 60 }),
}));

/** A stream whose track behaves like a real MediaStreamTrack: "live" until stop() ends it. */
function fakeStream(): MediaStream {
  const track = { readyState: "live" as MediaStreamTrackState, stop: vi.fn(() => { track.readyState = "ended"; }) };
  return { getTracks: () => [track] } as unknown as MediaStream;
}

function isEnded(stream: MediaStream): boolean {
  return stream.getTracks().every((t) => t.readyState === "ended");
}

function nonDegenerateRect(): DOMRect {
  return { left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
}

beforeEach(() => {
  vi.clearAllMocks();
  isCameraCaptureSupported.mockReturnValue(true);
  // A fresh stream per request, as getUserMedia gives — so leaks/replacements are observable.
  startCameraStream.mockImplementation(async () => fakeStream());
  // Mirrors the real stopCameraStream: stops every track.
  stopCameraStream.mockImplementation((stream: MediaStream | null | undefined) => {
    stream?.getTracks().forEach((t) => t.stop());
  });
  decodeBarcodeFromCanvas.mockResolvedValue(null);
  recognizeTextFromCanvas.mockResolvedValue("");

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
    expect(recognizeTextFromCanvas).not.toHaveBeenCalled();

    const captureButton = await screen.findByRole("button", { name: "Capture" });
    fireEvent.click(captureButton);
    await waitFor(() => expect(recognizeTextFromCanvas).toHaveBeenCalledTimes(1));
    // Only the cropped canvas is ever passed — never the raw <video> element/full frame.
    expect(recognizeTextFromCanvas).toHaveBeenCalledWith(expect.any(HTMLCanvasElement));
  });

  it("shows the recognized text as a candidate for review and does not call onConfirm until Use Value is pressed", async () => {
    recognizeTextFromCanvas.mockResolvedValue("ABC-12345");
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
    recognizeTextFromCanvas.mockResolvedValue("O0O l1I"); // deliberately ambiguous characters
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    expect(await screen.findByDisplayValue("O0O l1I")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use Value" }));
    expect(onConfirm).toHaveBeenCalledWith("O0O l1I");
  });

  it("Retake discards the candidate, keeps the camera stream open, and never calls onConfirm", async () => {
    recognizeTextFromCanvas.mockResolvedValue("first-read");
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
    recognizeTextFromCanvas.mockRejectedValue(new Error("Timed out preparing the text recogniser."));
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
    recognizeTextFromCanvas.mockRejectedValueOnce(new Error("init failed"));
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    expect(await screen.findByText(/couldn't read text from that image/i)).toBeInTheDocument();

    recognizeTextFromCanvas.mockResolvedValueOnce("RECOVERED-123");
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    expect(await screen.findByDisplayValue("RECOVERED-123")).toBeInTheDocument();
    // The stale warning from the first attempt is cleared once a new capture starts.
    expect(screen.queryByText(/couldn't read text from that image/i)).not.toBeInTheDocument();
  });

  it("closing the dialog during recognition drops the late result — it never reaches the field", async () => {
    let resolveRecognition: ((text: string) => void) | undefined;
    recognizeTextFromCanvas.mockReturnValue(new Promise<string>((res) => { resolveRecognition = res; }));
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="ORIGINAL" onClose={onClose} onConfirm={onConfirm} />);

    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await waitFor(() => expect(recognizeTextFromCanvas).toHaveBeenCalled());

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
    recognizeTextFromCanvas.mockReturnValue(new Promise<string>((res) => { resolveRecognition = res; }));
    const onConfirm = vi.fn();
    const { unmount } = render(
      <CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    await waitFor(() => expect(recognizeTextFromCanvas).toHaveBeenCalled());

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
    recognizeTextFromCanvas.mockResolvedValue("READ-1");
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
    expect(decodeBarcodeFromCanvas).toHaveBeenCalledWith(expect.any(HTMLCanvasElement));

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
    recognizeTextFromCanvas.mockResolvedValue("324775");
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
    recognizeTextFromCanvas.mockResolvedValue("V1.2.3");
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
    recognizeTextFromCanvas.mockResolvedValue("DR040");
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
    recognizeTextFromCanvas.mockResolvedValue("J000376");
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
    recognizeTextFromCanvas.mockResolvedValue("SN-1");
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
    recognizeTextFromCanvas.mockResolvedValue("3247751 ;"); // device regression reading
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
    recognizeTextFromCanvas.mockResolvedValue("ABC-128");
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
    recognizeTextFromCanvas.mockResolvedValueOnce("first").mockResolvedValueOnce("second");
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

  it("clearing the review field disables Use Value; an empty reading can be typed in", async () => {
    recognizeTextFromCanvas.mockResolvedValue("");
    const onConfirm = vi.fn();
    render(<CameraCaptureDialog mode="ocr" currentValue="" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
    const useValue = await screen.findByRole("button", { name: "Use Value" });
    expect(useValue).toBeDisabled();
    fireEvent.change(reviewField(), { target: { value: "DR040" } });
    expect(useValue).toBeEnabled();
    fireEvent.click(useValue);
    expect(onConfirm).toHaveBeenCalledWith("DR040");
  });

  it("number field: the edited string reaches the field's own onChange unconverted, only on Use Value", async () => {
    recognizeTextFromCanvas.mockResolvedValue("3247751 ;");
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
