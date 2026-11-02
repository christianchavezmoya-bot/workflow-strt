/**
 * Explicit issue deletions reach the API in save-progress and complete payloads (web path). The
 * API never treats an issue missing from issuesJson as deleted (RunIssueMerge).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/platform", () => ({ isMobileNativePlatform: vi.fn(() => false) }));
const put = vi.fn();
const post = vi.fn();
vi.mock("./api", () => ({ default: { put: (...a: unknown[]) => put(...a), post: (...a: unknown[]) => post(...a) }, cachedGet: vi.fn() }));
vi.mock("./mediaStore", () => ({ mediaStore: { resolveUploadPayload: vi.fn(async (body: unknown) => body) } }));

import { assetWorkflowRunService } from "./assetWorkflowRunService";

const run = { id: "run-1", assetId: "asset-1", issuesJson: "[]", stepResultsJson: "[]" };

beforeEach(() => {
  vi.clearAllMocks();
  put.mockResolvedValue({ data: run });
  post.mockResolvedValue({ data: run });
});

describe("explicit issue deletions in run payloads", () => {
  it("saveProgress sends deletedIssueIds when the user deleted issues", async () => {
    await assetWorkflowRunService.saveProgress("run-1", "[]", "[]", "InProgress", ["i1", "i2"]);
    expect(put.mock.calls[0][1]).toMatchObject({ issuesJson: "[]", deletedIssueIds: ["i1", "i2"] });
  });

  it("completeRun sends deletedIssueIds", async () => {
    await assetWorkflowRunService.completeRun("run-1", "[]", "[]", "Tech", undefined, ["i1"]);
    expect(post.mock.calls[0][1]).toMatchObject({ issuesJson: "[]", deletedIssueIds: ["i1"] });
  });

  it("payloads are unchanged when nothing was deleted", async () => {
    await assetWorkflowRunService.saveProgress("run-1", "[]", "[]");
    await assetWorkflowRunService.completeRun("run-1", "[]", "[]", "Tech", undefined, []);
    expect(put.mock.calls[0][1]).not.toHaveProperty("deletedIssueIds");
    expect(post.mock.calls[0][1]).not.toHaveProperty("deletedIssueIds");
  });
});
