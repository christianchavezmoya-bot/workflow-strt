import { describe, expect, it, vi } from "vitest";
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

import { ReferenceContentSection, resolveAttachedMedia } from "./ReferenceContent";

function photoA(): MediaItem {
  return { id: "photoA", type: "image", name: "photoA.jpg", size: 1000, mime: "image/jpeg", url: "/api/workflow-configs/cfg/media/photoA/file", createdAt: 1 };
}
function videoB(): MediaItem {
  return { id: "videoB", type: "video", name: "videoB.mp4", size: 2000, mime: "video/mp4", url: "/api/workflow-configs/cfg/media/videoB/file", createdAt: 2 };
}

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

describe("ReferenceContentSection — video uses a real HTML5 video element (TEST G)", () => {
  it("renders images as <img> and videos as a real <video controls playsInline> element, both URL-resolved", () => {
    const { container } = render(<ReferenceContentSection media={[photoA(), videoB()]} />);

    const img = screen.getByAltText("photoA.jpg");
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("https://api.staging.strata-ngo.com/api/workflow-configs/cfg/media/photoA/file");

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.hasAttribute("controls")).toBe(true);
    expect(video?.hasAttribute("playsInline")).toBe(true);
    expect(video?.hasAttribute("autoplay")).toBe(false);
    expect(video?.getAttribute("src")).toBe("https://api.staging.strata-ngo.com/api/workflow-configs/cfg/media/videoB/file");
  });

  it("renders only the media it is given — proves per-step isolation at the presentation layer", () => {
    const { rerender, container } = render(<ReferenceContentSection media={[photoA()]} />);
    expect(screen.getByAltText("photoA.jpg")).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();

    rerender(<ReferenceContentSection media={[videoB()]} />);
    expect(screen.queryByAltText("photoA.jpg")).not.toBeInTheDocument();
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("renders nothing for an empty media list", () => {
    const { container } = render(<ReferenceContentSection media={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("ReferenceContentSection — image click opens an in-app lightbox, never navigates (TEST 4)", () => {
  it("has no anchor element wrapping the image thumbnail", () => {
    const { container } = render(<ReferenceContentSection media={[photoA()]} />);
    expect(container.querySelector("a")).toBeNull();
  });

  it("clicking the thumbnail opens a modal showing the same (resolved) image, without navigating", () => {
    render(<ReferenceContentSection media={[photoA()]} />);

    // Only the thumbnail image exists before clicking.
    expect(screen.getAllByAltText("photoA.jpg")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /view photoA\.jpg/i }));

    // A dialog is now open, containing a second, larger copy of the same resolved image.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    const images = screen.getAllByAltText("photoA.jpg");
    expect(images).toHaveLength(2);
    expect(images[1].getAttribute("src")).toBe("https://api.staging.strata-ngo.com/api/workflow-configs/cfg/media/photoA/file");

    // No navigation occurred — jsdom's location is untouched.
    expect(window.location.pathname).toBe("/");
  });

  it("closing the lightbox removes the dialog and leaves the thumbnail intact", async () => {
    render(<ReferenceContentSection media={[photoA()]} />);

    fireEvent.click(screen.getByRole("button", { name: /view photoA\.jpg/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The thumbnail (component/workflow presentation state) is still there.
    expect(screen.getByAltText("photoA.jpg")).toBeInTheDocument();
  });
});
