import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReferenceContentSection, resolveAttachedMedia } from "./ReferenceContent";
import type { MediaItem } from "../../types/workflow";

function photoA(): MediaItem {
  return { id: "photoA", type: "image", name: "photoA.jpg", size: 1000, mime: "image/jpeg", url: "/media/photoA", createdAt: 1 };
}
function videoB(): MediaItem {
  return { id: "videoB", type: "video", name: "videoB.mp4", size: 2000, mime: "video/mp4", url: "/media/videoB", createdAt: 2 };
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
    // resolveAttachedMedia's signature only ever accepts (mediaIds, workflowMedia) —
    // it has no way to read step.inputs / captured evidence even if a caller wanted it to.
    // A step with a technician "photo" capture Input alongside reference mediaIds must not
    // leak that Input into what's resolved as reference Content.
    const library = [photoA()];
    const stepMediaIds = ["photoA"]; // the step's technician "photo" Input is a separate field entirely, not represented here

    expect(resolveAttachedMedia(stepMediaIds, library)).toEqual([photoA()]);
  });
});

describe("ReferenceContentSection — video uses a real HTML5 video element (TEST G)", () => {
  it("renders images as <img> and videos as a real <video controls> element, never an icon/link-only placeholder", () => {
    const { container } = render(<ReferenceContentSection media={[photoA(), videoB()]} />);

    const img = screen.getByAltText("photoA.jpg");
    expect(img.tagName).toBe("IMG");

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.hasAttribute("controls")).toBe(true);
    expect(video?.hasAttribute("autoplay")).toBe(false);
    expect(video?.getAttribute("src")).toBe("/media/videoB");
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
