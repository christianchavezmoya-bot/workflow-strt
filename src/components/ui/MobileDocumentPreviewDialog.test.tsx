import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MobileDocumentPreviewDialog from "./MobileDocumentPreviewDialog";
import type { DocumentRecord } from "../../services/documentService";

vi.mock("../../services/documentService", () => ({
  documentService: {
    openDocument: vi.fn().mockResolvedValue("blob:mock-video-url"),
    openDocumentAsBuffer: vi.fn(),
    downloadDocument: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../utils/platform", () => ({
  isMobileNativePlatform: () => false,
}));

const { documentService } = await import("../../services/documentService");

const VIDEO_DOC: DocumentRecord = {
  id: "doc-1",
  name: "video test",
  type: "tips",
  linkedTo: "tip-1",
  uploadedAt: "2026-09-16T00:00:00Z",
  contentType: "video/mp4",
  fileSize: 8_800_000,
  downloadUrl: "https://example.com/video-test.mp4",
};

// Regression coverage for the Tips & Tricks video-cropping bug: a flex item's default
// min-height is "auto" (its content's intrinsic size), not 0, so without an explicit
// minHeight: 0 override the video-wrapping Box grew to the <video>'s full intrinsic height
// (huge for a portrait clip rendered at width:100%) and DialogContent's overflow:hidden
// silently clipped it to the top slice. See MobileDocumentPreviewDialog.tsx's video branch.
describe("MobileDocumentPreviewDialog — video preview", () => {
  it("renders the video with a non-cropping, aspect-ratio-preserving presentation", async () => {
    render(<MobileDocumentPreviewDialog doc={VIDEO_DOC} open onClose={vi.fn()} />);

    const video = await waitFor(() => {
      const el = document.querySelector("video");
      if (!el) throw new Error("video element not yet rendered");
      return el;
    });

    expect(video).toBeTruthy();
    expect(video.getAttribute("src")).toBe("blob:mock-video-url");

    // object-fit must never be "cover" — contain (or an unset/inherited value that resolves
    // to contain) is what lets the full frame stay visible instead of being cropped.
    const videoStyle = getComputedStyle(video);
    expect(videoStyle.objectFit).not.toBe("cover");
    expect(videoStyle.objectFit).toBe("contain");

    // The video must not be forced to a fixed/100% height — height:auto (or unset, which
    // defaults to auto) is what lets it shrink to its own aspect ratio instead of stretching
    // to fill whatever the parent's height happens to be.
    expect(videoStyle.height).not.toBe("100%");
  });

  it("does not force the video-wrapping flex container to grow with the video's intrinsic size", async () => {
    render(<MobileDocumentPreviewDialog doc={VIDEO_DOC} open onClose={vi.fn()} />);

    const video = await waitFor(() => {
      const el = document.querySelector("video");
      if (!el) throw new Error("video element not yet rendered");
      return el;
    });

    const wrapper = video.parentElement;
    expect(wrapper).toBeTruthy();
    // The load-bearing fix: without this, the flex item's default min-height:auto lets it
    // balloon to the video's oversized intrinsic height instead of respecting the space
    // DialogContent actually has available.
    expect(getComputedStyle(wrapper!).minHeight).toBe("0px");
  });

  it("keeps the header title, Download, and Close controls visible alongside the video", async () => {
    const onClose = vi.fn();
    render(<MobileDocumentPreviewDialog doc={VIDEO_DOC} open onClose={onClose} />);

    await waitFor(() => expect(document.querySelector("video")).toBeTruthy());

    expect(screen.getByText("video test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();
  });

  it("Download still calls documentService.downloadDocument with the original file name and URL", async () => {
    render(<MobileDocumentPreviewDialog doc={VIDEO_DOC} open onClose={vi.fn()} />);

    await waitFor(() => expect(document.querySelector("video")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    expect(documentService.downloadDocument).toHaveBeenCalledWith(
      "https://example.com/video-test.mp4",
      "video test",
    );
  });
});
