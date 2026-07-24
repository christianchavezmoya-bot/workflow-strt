import { describe, expect, it } from "vitest";
import { buildSyncIdempotencyKey } from "./syncQueue";

describe("buildSyncIdempotencyKey", () => {
  const base = {
    opType: "SIGNATURE_SUBMIT" as const,
    url: "/signature-events?runId=run-1",
    method: "POST" as const,
    entityType: "workflow-run",
    entityId: "run-1",
  };

  it("separates installer and customer signature queue entries", () => {
    const installer = buildSyncIdempotencyKey({
      ...base,
      body: { signerRole: "Installer", signerName: "Tech" },
    });
    const customer = buildSyncIdempotencyKey({
      ...base,
      body: { signerRole: "Customer", signerName: "Client" },
    });
    expect(installer).not.toBe(customer);
    expect(installer).toContain(":Installer");
    expect(customer).toContain(":Customer");
  });

  it("coalesces repeated updates for the same signer role", () => {
    const first = buildSyncIdempotencyKey({
      ...base,
      body: { signerRole: "Installer", signerName: "A" },
    });
    const second = buildSyncIdempotencyKey({
      ...base,
      body: { signerRole: "Installer", signerName: "B" },
    });
    expect(first).toBe(second);
  });

  it("coalesces repeated attach ops for the same asset and document", () => {
    const first = buildSyncIdempotencyKey({
      opType: "ASSET_DOCUMENT_LINK_ATTACH",
      url: "/asset-document-links",
      method: "POST",
      entityType: "asset-document-link",
      entityId: "link-1",
      body: { assetId: "asset-1", documentId: "doc-1" },
    });
    const second = buildSyncIdempotencyKey({
      opType: "ASSET_DOCUMENT_LINK_ATTACH",
      url: "/asset-document-links",
      method: "POST",
      entityType: "asset-document-link",
      entityId: "link-2",
      body: { assetId: "asset-1", documentId: "doc-1" },
    });
    expect(first).toBe(second);
    expect(first).toBe("ASSET_DOCUMENT_LINK_ATTACH:POST:asset-1:doc-1");
  });
});
