import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitForElementToBeRemoved } from "@testing-library/react";
import type { MediaItem } from "../../types/workflow";

// jsdom's default test origin (http://localhost:3000) is deliberately different
// from the mocked API origin below — any test that would only pass by
// accidentally resolving against window.location.origin (the original defect)
// fails here.
const getApiBaseUrl = vi.fn(() => "https://api.staging.strata-ngo.com/api");
vi.mock("../../services/apiBase", () => ({
  getApiBaseUrl: () => getApiBaseUrl(),
}));

let mockIsMobileNativePlatform = vi.fn(() => false);
vi.mock("../../utils/platform", () => ({
  isMobileNativePlatform: () => mockIsMobileNativePlatform(),
}));

import { ReferenceContentSection, resolveAttachedMedia } from "./ReferenceContent";
import { NATIVE_NESTED_DIALOG_Z_INDEX } from "../../utils/nativeDialogInsets";

function photoA(): MediaItem {
  return { id: "photoA", type: "image", name: "photoA.jpg", size: 1000, mime: "image/jpeg", url: "/api/workflow-configs/cfg/media/photoA/file", createdAt: 1 };
}
function videoB(): MediaItem {
  return { id: "videoB", type: "video", name: "videoB.mp4", size: 2000, mime: "video/mp4", url: "/api/workflow-configs/cfg/media/videoB/file", createdAt: 2 };
}

beforeEach(() => {
  mockIsMobileNativePlatform = vi.fn(() => false);
});

describe("resolveAttachedMedia — step-scoped resolution (shared by Runner + Worker Preview)", () => {
  it("resolves only the ids in mediaIds against the workflow library, in either direction", () => {
    const library = [photoA(), videoB()];

    expect(resolveAttachedMedia(["photoA"], library).map((m) => m.id)).toEqual(["photoA"]);
    expect(resolveAttachedMedia(["videoB"], library).map((m) => m.id)).toEqual(["videoB"]);
    expect(resolveAttachedMedia([], library)).toEqual([]);
    expect(resolveAttachedMedia(undefined, library)).toEqual([]);
  });

  it("is independent of anything on a step besides mediaIds (TEST H — no coupling to capture/inputs)", () => {
    const library = [photoA()];
    const stepMediaIds = ["photoA"];

    expect(resolveAttachedMedia(stepMediaIds, library)).toEqual([photoA()]);
  });
});

describe("ReferenceContentSection — thumbnails render, both photo and video are tappable, not inline video (TEST G)", () => {
  it("renders an image thumbnail as <img>, and a video as a tappable play-icon thumbnail (no inline <video>)", () => {
    const { container } = render(<ReferenceContentSection media={[photoA(), videoB()]} />);

    const img = screen.getByAltText("photoA.jpg");
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("https://api.staging.strata-ngo.com/api/workflow-configs/cfg/media/photoA/file");

    // Video is NOT rendered inline before the modal is opened — only a tappable preview.
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByRole("button", { name: /play videoB\.mp4/i })).toBeInTheDocument();
    expect(screen.getByText("videoB.mp4")).toBeInTheDocument();
  });

  it("renders only the media it is given — proves per-step isolation at the presentation layer", () => {
    const { rerender, container } = render(<ReferenceContentSection media={[photoA()]} />);
    expect(screen.getByAltText("photoA.jpg")).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();

    rerender(<ReferenceContentSection media={[videoB()]} />);
    expect(screen.queryByAltText("photoA.jpg")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play videoB\.mp4/i })).toBeInTheDocument();
  });

  it("renders nothing for an empty media list", () => {
    const { container } = render(<ReferenceContentSection media={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("ReferenceContentSection — image click opens an in-app lightbox with a visible Close button, never navigates (TEST 4)", () => {
  it("has no anchor element wrapping the image thumbnail", () => {
    const { container } = render(<ReferenceContentSection media={[photoA()]} />);
    expect(container.querySelector("a")).toBeNull();
  });

  it("clicking the thumbnail opens a modal showing the same (resolved) image, with a visible Close button, without navigating", () => {
    render(<ReferenceContentSection media={[photoA()]} />);

    expect(screen.getAllByAltText("photoA.jpg")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /view photoA\.jpg/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    const images = screen.getAllByAltText("photoA.jpg");
    expect(images).toHaveLength(2);
    expect(images[1].getAttribute("src")).toBe("https://api.staging.strata-ngo.com/api/workflow-configs/cfg/media/photoA/file");

    // Explicit, visible "Close" text button (not just an icon) — required UX.
    const closeButtons = screen.getAllByRole("button", { name: /^close$/i });
    expect(closeButtons.length).toBeGreaterThan(0);

    expect(window.location.pathname).toBe("/");
  });

  it("closing via the visible Close button removes the dialog and leaves the thumbnail intact, returning to the same step", async () => {
    render(<ReferenceContentSection media={[photoA()]} />);

    fireEvent.click(screen.getByRole("button", { name: /view photoA\.jpg/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /^close$/i })[0]);
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByAltText("photoA.jpg")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("applies the native nested-dialog z-index on native so the lightbox renders above the runner's own pinned dialog", () => {
    mockIsMobileNativePlatform = vi.fn(() => true);
    render(<ReferenceContentSection media={[photoA()]} />);

    fireEvent.click(screen.getByRole("button", { name: /view photoA\.jpg/i }));

    const dialogRoot = document.querySelector(".MuiDialog-root") as HTMLElement | null;
    expect(dialogRoot).not.toBeNull();
    expect(dialogRoot).toHaveStyle({ zIndex: NATIVE_NESTED_DIALOG_Z_INDEX });
  });

  it("does not apply a native z-index override on web", () => {
    mockIsMobileNativePlatform = vi.fn(() => false);
    render(<ReferenceContentSection media={[photoA()]} />);

    fireEvent.click(screen.getByRole("button", { name: /view photoA\.jpg/i }));

    const dialogRoot = document.querySelector(".MuiDialog-root") as HTMLElement | null;
    expect(dialogRoot).not.toHaveStyle({ zIndex: NATIVE_NESTED_DIALOG_Z_INDEX });
  });
});

describe("ReferenceContentSection — video opens an in-app modal viewer with a visible Close button, never navigates", () => {
  it("has no anchor element wrapping the video thumbnail", () => {
    const { container } = render(<ReferenceContentSection media={[videoB()]} />);
    expect(container.querySelector("a")).toBeNull();
  });

  it("tapping the video thumbnail opens a modal with a real, controllable <video> element and a visible Close button", () => {
    render(<ReferenceContentSection media={[videoB()]} />);

    fireEvent.click(screen.getByRole("button", { name: /play videoB\.mp4/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // MUI Dialog portals into document.body, outside the render container — query the dialog itself.
    const video = dialog.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.hasAttribute("controls")).toBe(true);
    expect(video?.hasAttribute("playsInline")).toBe(true);
    expect(video?.getAttribute("src")).toBe("https://api.staging.strata-ngo.com/api/workflow-configs/cfg/media/videoB/file");

    const closeButtons = screen.getAllByRole("button", { name: /^close$/i });
    expect(closeButtons.length).toBeGreaterThan(0);

    expect(window.location.pathname).toBe("/");
    expect(dialog.querySelector("a")).toBeNull();
  });

  it("closing the video modal unmounts the <video> element (stopping playback) and returns to the same step", async () => {
    render(<ReferenceContentSection media={[videoB()]} />);

    fireEvent.click(screen.getByRole("button", { name: /play videoB\.mp4/i }));
    expect(screen.getByRole("dialog").querySelector("video")).not.toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /^close$/i })[0]);
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Element is gone entirely — the most reliable, unit-testable proof that playback stopped
    // (jsdom's HTMLMediaElement has no real playback state to assert against directly).
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByRole("button", { name: /play videoB\.mp4/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("applies the native nested-dialog z-index on native, matching the photo lightbox fix", () => {
    mockIsMobileNativePlatform = vi.fn(() => true);
    render(<ReferenceContentSection media={[videoB()]} />);

    fireEvent.click(screen.getByRole("button", { name: /play videoB\.mp4/i }));

    const dialogRoots = document.querySelectorAll(".MuiDialog-root");
    const videoDialogRoot = Array.from(dialogRoots).find((el) => el.querySelector("video")) as HTMLElement | undefined;
    expect(videoDialogRoot).toHaveStyle({ zIndex: NATIVE_NESTED_DIALOG_Z_INDEX });
  });
});
