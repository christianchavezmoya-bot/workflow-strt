import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

let mockIsMobileNativePlatform = vi.fn(() => false);
vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: () => mockIsMobileNativePlatform(),
}));

import { useIsKeyboardOpen } from "./useIsKeyboardOpen";

class FakeVisualViewport extends EventTarget {
  height: number;
  constructor(height: number) {
    super();
    this.height = height;
  }
  setHeight(height: number) {
    this.height = height;
    this.dispatchEvent(new Event("resize"));
  }
}

afterEach(() => {
  mockIsMobileNativePlatform = vi.fn(() => false);
  // @ts-expect-error test override
  delete window.visualViewport;
});

describe("useIsKeyboardOpen", () => {
  it("stays false on web even when visualViewport shrinks a lot", () => {
    mockIsMobileNativePlatform = vi.fn(() => false);
    const vv = new FakeVisualViewport(800);
    // @ts-expect-error test override
    window.visualViewport = vv;

    const { result } = renderHook(() => useIsKeyboardOpen());
    expect(result.current).toBe(false);

    act(() => vv.setHeight(400));
    expect(result.current).toBe(false);
  });

  it("becomes true on native once the viewport shrinks past the threshold", () => {
    mockIsMobileNativePlatform = vi.fn(() => true);
    const vv = new FakeVisualViewport(800);
    // @ts-expect-error test override
    window.visualViewport = vv;

    const { result } = renderHook(() => useIsKeyboardOpen());
    expect(result.current).toBe(false);

    act(() => vv.setHeight(400)); // 400px shrink — well past the keyboard threshold
    expect(result.current).toBe(true);

    act(() => vv.setHeight(800)); // keyboard dismissed — viewport restored
    expect(result.current).toBe(false);
  });

  it("does not flag small, non-keyboard viewport fluctuations as a keyboard", () => {
    mockIsMobileNativePlatform = vi.fn(() => true);
    const vv = new FakeVisualViewport(800);
    // @ts-expect-error test override
    window.visualViewport = vv;

    const { result } = renderHook(() => useIsKeyboardOpen());

    act(() => vv.setHeight(780)); // 20px — status bar / rotation jitter, not a keyboard
    expect(result.current).toBe(false);
  });

  it("tracks the tallest viewport seen, not just the value at mount (orientation change safe)", () => {
    mockIsMobileNativePlatform = vi.fn(() => true);
    const vv = new FakeVisualViewport(400); // starts short, e.g. landscape
    // @ts-expect-error test override
    window.visualViewport = vv;

    const { result } = renderHook(() => useIsKeyboardOpen());
    expect(result.current).toBe(false);

    act(() => vv.setHeight(800)); // rotate to portrait — taller than the mount value
    expect(result.current).toBe(false);

    act(() => vv.setHeight(400)); // keyboard opens against the new, taller baseline
    expect(result.current).toBe(true);
  });
});
