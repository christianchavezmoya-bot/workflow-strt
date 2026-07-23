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
});
