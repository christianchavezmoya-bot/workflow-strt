import { describe, expect, it } from "vitest";
import {
  WORKFLOW_VIDEO_MAX_BYTES,
  WorkflowMediaTooLargeError,
  formatWorkflowVideoTooLargeMessage,
  getWorkflowVideoSizeError,
  prepareWorkflowMediaFile,
} from "./mediaProcessing";

function makeFile(name: string, size: number, type: string): File {
  const bytes = new Uint8Array(Math.min(size, 64));
  const file = new File([bytes], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("workflow video size guard", () => {
  it("allows videos at or under the limit", () => {
    const file = makeFile("clip.mp4", WORKFLOW_VIDEO_MAX_BYTES, "video/mp4");
    expect(getWorkflowVideoSizeError(file)).toBeNull();
  });

  it("rejects oversized library videos with a crop/compress message", () => {
    const file = makeFile("library-walkthrough.mov", WORKFLOW_VIDEO_MAX_BYTES + 1, "video/quicktime");
    const message = getWorkflowVideoSizeError(file);
    expect(message).toContain("library-walkthrough.mov");
    expect(message).toMatch(/max 15\.0 MB/i);
    expect(message).toMatch(/compress\/crop/i);
  });

  it("detects video by extension when mime is empty (common on iOS library picks)", () => {
    const file = makeFile("IMG_1234.MOV", WORKFLOW_VIDEO_MAX_BYTES + 5_000_000, "");
    expect(getWorkflowVideoSizeError(file)).toMatch(/IMG_1234\.MOV/);
  });

  it("does not apply the video limit to images", () => {
    const file = makeFile("photo.jpg", WORKFLOW_VIDEO_MAX_BYTES + 1, "image/jpeg");
    expect(getWorkflowVideoSizeError(file)).toBeNull();
  });

  it("prepareWorkflowMediaFile throws WorkflowMediaTooLargeError for oversized video", async () => {
    const file = makeFile("big.mp4", 40 * 1024 * 1024, "video/mp4");
    await expect(prepareWorkflowMediaFile(file)).rejects.toBeInstanceOf(WorkflowMediaTooLargeError);
  });

  it("formats a stable user-facing message", () => {
    expect(formatWorkflowVideoTooLargeMessage("a.mp4", 20 * 1024 * 1024)).toBe(
      "a.mp4 is 20.0 MB — max 15.0 MB. Record a shorter clip, or compress/crop the video and try again.",
    );
  });
});
