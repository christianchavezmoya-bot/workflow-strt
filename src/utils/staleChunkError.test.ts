import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  attemptChunkReload,
  canAttemptChunkReload,
  clearChunkReloadFlag,
  isStaleChunkError,
} from "./staleChunkError";

describe("isStaleChunkError", () => {
  it("detects Chrome dynamic import failures", () => {
    const err = new TypeError(
      "Failed to fetch dynamically imported module: http://localhost:5174/assets/FaultReportsPage-Bc08ET82.js",
    );
    expect(isStaleChunkError(err)).toBe(true);
  });

  it("detects Safari module script failures", () => {
    const err = new TypeError("Importing a module script failed.");
    expect(isStaleChunkError(err)).toBe(true);
  });

  it("detects webpack ChunkLoadError", () => {
    const err = new Error("Loading chunk 42 failed.") as Error & { name: string };
    err.name = "ChunkLoadError";
    expect(isStaleChunkError(err)).toBe(true);
  });

  it("ignores unrelated application errors", () => {
    expect(isStaleChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
  });
});

describe("chunk reload guard", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("allows one reload attempt per cooldown window", () => {
    expect(canAttemptChunkReload()).toBe(true);

    const reload = vi.fn();
    vi.stubGlobal("location", { reload: reload });

    expect(attemptChunkReload()).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(canAttemptChunkReload()).toBe(false);

    vi.setSystemTime(new Date("2026-08-21T00:00:20Z"));
    expect(canAttemptChunkReload()).toBe(false);

    vi.setSystemTime(new Date("2026-08-21T00:00:31Z"));
    expect(canAttemptChunkReload()).toBe(true);
  });

  it("clears the reload flag after a successful boot", () => {
    sessionStorage.setItem("commtrac:chunk-reload-at", String(Date.now()));
    clearChunkReloadFlag();
    expect(canAttemptChunkReload()).toBe(true);
  });
});
