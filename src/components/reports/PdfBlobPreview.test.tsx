import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import * as pdfjsLib from "pdfjs-dist";
import PdfBlobPreview from "./PdfBlobPreview";

// A minimal fake pdf.js document: N pages, each rendering instantly. Lets these tests
// assert stacked-canvas behavior without parsing a real PDF byte stream.
function makeFakePdf(numPages: number) {
  return {
    numPages,
    getPage: vi.fn(async (_index: number) => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
      render: () => ({ promise: Promise.resolve() }),
    })),
  };
}

let currentPageCount = 1;

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  version: "test",
  getDocument: vi.fn(() => ({
    promise: Promise.resolve(makeFakePdf(currentPageCount)),
    destroy: vi.fn(),
  })),
}));

let liveResizeObservers: FakeResizeObserver[] = [];

class FakeResizeObserver {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) { this.cb = cb; }
  observe(target: Element) {
    liveResizeObservers.push(this);
    this.cb(
      [{ contentRect: { width: 800 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
    void target;
  }
  /** Test helper: simulate another ResizeObserver tick with the given reported width. */
  fire(width: number) {
    this.cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

describe("PdfBlobPreview", () => {
  beforeEach(() => {
    currentPageCount = 1;
    liveResizeObservers = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders every page of a multi-page PDF as a stacked canvas, not just page 1", async () => {
    currentPageCount = 3;
    const { container } = render(<PdfBlobPreview blob={new Blob(["fake"], { type: "application/pdf" })} />);

    await waitFor(() => {
      expect(container.querySelectorAll("canvas").length).toBe(3);
    });
  });

  it("renders exactly one canvas for a single-page PDF", async () => {
    currentPageCount = 1;
    const { container } = render(<PdfBlobPreview blob={new Blob(["fake"], { type: "application/pdf" })} />);

    await waitFor(() => {
      expect(container.querySelectorAll("canvas").length).toBe(1);
    });
  });

  it("never renders the primary preview as an iframe — canvas rendering is unconditional across platforms", async () => {
    currentPageCount = 2;
    const { container } = render(<PdfBlobPreview blob={new Blob(["fake"], { type: "application/pdf" })} />);

    await waitFor(() => {
      expect(container.querySelectorAll("canvas").length).toBe(2);
    });
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("respects an explicit scrollHint override across page counts", async () => {
    currentPageCount = 2;
    render(<PdfBlobPreview blob={new Blob(["fake"], { type: "application/pdf" })} scrollHint="Review before signing" />);

    await waitFor(() => {
      expect(screen.getByText("Review before signing")).toBeInTheDocument();
    });
  });

  it(
    "does not re-render when ResizeObserver reports sub-pixel jitter that rounds to the same width " +
    "— regression for the flashing/never-finishing render loop where a scrollbar appearing/disappearing " +
    "narrowed the observed width, retriggering a full teardown-and-rebuild on every tick",
    async () => {
      currentPageCount = 6;
      const getDocumentSpy = vi.mocked(pdfjsLib.getDocument);
      const { container } = render(<PdfBlobPreview blob={new Blob(["fake"], { type: "application/pdf" })} />);

      await waitFor(() => {
        expect(container.querySelectorAll("canvas").length).toBe(6);
      });
      // Let any of the component's own startup effects (pinch-zoom init, etc.) settle
      // before taking the baseline — this test isolates the resize-jitter mechanism
      // specifically, not total render-effect firings across the whole component.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const callsBeforeJitter = getDocumentSpy.mock.calls.length;

      // Simulate the exact mechanism that caused the loop: a scrollbar appearing/disappearing
      // reports a fractionally different contentRect.width across ticks with no real layout
      // change (e.g. 800 -> 799.6 -> 800.2), which should round to the same integer width.
      const observer = liveResizeObservers[0];
      observer.fire(799.6);
      observer.fire(800.2);
      observer.fire(800.49);

      // Give the rAF-deferred width update a chance to run if it were going to.
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(getDocumentSpy.mock.calls.length).toBe(callsBeforeJitter);
      expect(container.querySelectorAll("canvas").length).toBe(6);
    },
  );
});
