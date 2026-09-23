import { describe, expect, it } from "vitest";
import { formatStorageBytes } from "./formatStorageBytes";

describe("formatStorageBytes", () => {
  it("formats bytes, KB, MB, and GB at the right scale", () => {
    expect(formatStorageBytes(500)).toBe("500 B");
    expect(formatStorageBytes(2048)).toBe("2 KB");
    expect(formatStorageBytes(5 * 1024 ** 2)).toBe("5.0 MB");
    expect(formatStorageBytes(6.8 * 1024 ** 3)).toBe("6.8 GB");
  });

  it("handles zero", () => {
    expect(formatStorageBytes(0)).toBe("0 B");
  });
});
