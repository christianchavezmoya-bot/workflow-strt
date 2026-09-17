import { afterEach, describe, expect, it, vi } from "vitest";

let mockIsMobileNativePlatform = vi.fn(() => false);
vi.mock("./platform", () => ({
  isMobileNativePlatform: () => mockIsMobileNativePlatform(),
}));

import { nativeDialogPaperSx, nativePopoverSx, NATIVE_BOTTOM_NAV_INSET, NATIVE_NESTED_DIALOG_Z_INDEX } from "./nativeDialogInsets";

afterEach(() => {
  mockIsMobileNativePlatform = vi.fn(() => false);
});

// Regression coverage for mobile acceptance P0-2/P0-3: a dialog Paper sized against 100vh is
// sized against the LARGEST possible WKWebView viewport (as if the keyboard/toolbar were
// hidden), not the actually-visible one — so once the keyboard opens, the Paper (and its sticky
// footer) can be taller than what's really on screen, pushing Cancel/Next/Save below the
// reachable area. 100dvh tracks the real visible viewport instead.
describe("nativeDialogPaperSx", () => {
  it("sizes maxHeight against the dynamic viewport (100dvh), never the static one (100vh), on native", () => {
    mockIsMobileNativePlatform = vi.fn(() => true);

    const sx = nativeDialogPaperSx() as Record<string, unknown>;

    expect(sx.maxHeight).toBe(`calc(100dvh - ${NATIVE_BOTTOM_NAV_INSET})`);
    expect(String(sx.maxHeight)).not.toContain("100vh");
  });

  it("is a no-op on web — returns whatever `extra` was passed through unchanged", () => {
    mockIsMobileNativePlatform = vi.fn(() => false);

    expect(nativeDialogPaperSx()).toBeUndefined();
    expect(nativeDialogPaperSx({ maxHeight: "100vh" })).toEqual({ maxHeight: "100vh" });
  });

  it("lets a caller's `extra` override maxHeight even on native, without reintroducing 100vh by default", () => {
    mockIsMobileNativePlatform = vi.fn(() => true);

    const sx = nativeDialogPaperSx({ maxHeight: "100dvh", mb: 0 }) as Record<string, unknown>;

    expect(sx.maxHeight).toBe("100dvh");
    expect(sx.mb).toBe(0);
  });
});

// Regression coverage for the Start Downtime reason Popover (WorkOrderRunner): MUI Popover is
// built on the same Modal primitive as Dialog and gets the same MUI-default zIndex (1300) with
// no override — below the runner's pinned 1500 on native, so the popover opened but rendered
// invisibly behind the still-visible runner, making "Start Downtime" look like it did nothing.
describe("nativePopoverSx", () => {
  it("pins the popover above the runner's own z-index on native", () => {
    mockIsMobileNativePlatform = vi.fn(() => true);

    expect(nativePopoverSx()).toEqual({ zIndex: NATIVE_NESTED_DIALOG_Z_INDEX });
  });

  it("is a no-op on web", () => {
    mockIsMobileNativePlatform = vi.fn(() => false);

    expect(nativePopoverSx()).toBeUndefined();
  });
});
