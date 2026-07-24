import { describe, expect, it } from "vitest";
import { mediaStore } from "./mediaStore";

describe("mediaStore.persistIssueMediaInJson", () => {
  it("returns original JSON on web (no filesystem)", async () => {
    const input = JSON.stringify([{ id: "i1", resolutionMedia: ["data:image/png;base64,abc"] }]);
    await expect(mediaStore.persistIssueMediaInJson(input, "run-1")).resolves.toBe(input);
  });

  it("leaves JSON unchanged when no resolution media", async () => {
    const input = JSON.stringify([{ id: "i1", resolved: true }]);
    await expect(mediaStore.persistIssueMediaInJson(input, "run-1")).resolves.toBe(input);
  });
});
