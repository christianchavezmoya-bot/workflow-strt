import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchToSinks,
  getFaultReportSinks,
  registerFaultReportSink,
  resetFaultReportSinks,
} from "./sinks";
import type { FaultReportPayload } from "./types";

vi.mock("../api", () => ({ default: { post: vi.fn() } }));

const payload = { title: "boom" } as unknown as FaultReportPayload;

describe("fault report sinks", () => {
  beforeEach(() => {
    resetFaultReportSinks();
  });

  it("reports failure when nothing is registered", async () => {
    await expect(dispatchToSinks(payload)).resolves.toBe(false);
  });

  it("ignores a duplicate registration of the same sink name", () => {
    registerFaultReportSink({ name: "a", send: vi.fn() });
    registerFaultReportSink({ name: "a", send: vi.fn() });
    expect(getFaultReportSinks()).toHaveLength(1);
  });

  it("sends to every registered sink", async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    registerFaultReportSink({ name: "first", send: first });
    registerFaultReportSink({ name: "second", send: second });

    await expect(dispatchToSinks(payload)).resolves.toBe(true);
    expect(first).toHaveBeenCalledWith(payload);
    expect(second).toHaveBeenCalledWith(payload);
  });

  it("counts as delivered when at least one sink succeeds", async () => {
    registerFaultReportSink({ name: "broken", send: vi.fn().mockRejectedValue(new Error("nope")) });
    registerFaultReportSink({ name: "working", send: vi.fn().mockResolvedValue(undefined) });

    await expect(dispatchToSinks(payload)).resolves.toBe(true);
  });

  it("does not let one failing sink stop the others", async () => {
    const working = vi.fn().mockResolvedValue(undefined);
    registerFaultReportSink({ name: "broken", send: vi.fn().mockRejectedValue(new Error("nope")) });
    registerFaultReportSink({ name: "working", send: working });

    await dispatchToSinks(payload);
    expect(working).toHaveBeenCalledOnce();
  });

  it("reports failure when every sink fails, so the caller can queue", async () => {
    registerFaultReportSink({ name: "a", send: vi.fn().mockRejectedValue(new Error("a")) });
    registerFaultReportSink({ name: "b", send: vi.fn().mockRejectedValue(new Error("b")) });

    await expect(dispatchToSinks(payload)).resolves.toBe(false);
  });
});
