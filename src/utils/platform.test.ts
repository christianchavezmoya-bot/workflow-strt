import { describe, expect, it, vi } from "vitest";
import { shouldUsePdfJsPreview } from "./platform";

describe("shouldUsePdfJsPreview", () => {
  it("returns false on desktop-like web without coarse pointer", () => {
    const matchMedia = vi.fn(() => ({
      matches: false,
      media: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);

    expect(shouldUsePdfJsPreview()).toBe(false);

    vi.unstubAllGlobals();
  });

  it("returns true on narrow coarse-pointer viewports (mobile web)", () => {
    const matchMedia = vi.fn((query: string) => ({
      matches:
        query.includes("pointer: coarse") ||
        query.includes("max-width: 900px"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);

    expect(shouldUsePdfJsPreview()).toBe(true);

    vi.unstubAllGlobals();
  });
});
