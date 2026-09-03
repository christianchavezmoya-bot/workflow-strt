import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

class FakeResizeObserver {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) { this.cb = cb; }
  observe(target: Element) {
    this.cb(
      [{ contentRect: { width: 800 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
    void target;
  }
  unobserve() {}
  disconnect() {}
}

describe("PdfBlobPreview", () => {
  beforeEach(() => {
    currentPageCount = 1;
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
});
