import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The browser API-base resolution matrix.
 *
 * A single web bundle is served from localhost and from a LAN IP, and the value
 * baked in at build time is frequently stale (a device build, or a previous
 * machine's address). These cases pin which URL each combination resolves to.
 */

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: () => false,
}));

async function resolveApiBase(opts: {
  hostname: string;
  port: string;
  baked?: string;
  protocol?: string;
}): Promise<string> {
  vi.resetModules();

  if (opts.baked === undefined) vi.stubEnv("VITE_API_BASE", "");
  else vi.stubEnv("VITE_API_BASE", opts.baked);

  const protocol = opts.protocol ?? "http:";
  vi.stubGlobal("location", {
    hostname: opts.hostname,
    port: opts.port,
    protocol,
    href: `${protocol}//${opts.hostname}:${opts.port}/`,
  });

  const mod = await import("./apiBase");
  return mod.getDefaultApiBaseUrl();
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getDefaultApiBaseUrl — LAN host on the staging web port", () => {
  it("keeps a baked value that already matches the browsing host", async () => {
    expect(
      await resolveApiBase({
        hostname: "10.7.15.115",
        port: "5174",
        baked: "http://10.7.15.115:8080/api",
      }),
    ).toBe("http://10.7.15.115:8080/api");
  });

  it("rehosts a stale LAN address to the host the browser is actually using", async () => {
    expect(
      await resolveApiBase({
        hostname: "10.7.15.115",
        port: "5174",
        baked: "http://192.168.1.103:8080/api",
      }),
    ).toBe("http://10.7.15.115:8080/api");
  });

  it("rehosts a baked localhost value, which a LAN client cannot reach", async () => {
    expect(
      await resolveApiBase({
        hostname: "10.7.15.115",
        port: "5174",
        baked: "http://localhost:8080/api",
      }),
    ).toBe("http://10.7.15.115:8080/api");
  });

  it("falls back to the sibling API port when nothing was baked", async () => {
    expect(
      await resolveApiBase({ hostname: "10.7.15.115", port: "5174" }),
    ).toBe("http://10.7.15.115:8080/api");
  });
});

describe("getDefaultApiBaseUrl — localhost on the staging web port", () => {
  it("honours a baked localhost value", async () => {
    expect(
      await resolveApiBase({
        hostname: "localhost",
        port: "5174",
        baked: "http://localhost:8080/api",
      }),
    ).toBe("http://localhost:8080/api");
  });

  it("resolves a stale LAN baked value to the sibling API, not the dev port", async () => {
    expect(
      await resolveApiBase({
        hostname: "localhost",
        port: "5174",
        baked: "http://192.168.1.103:8080/api",
      }),
    ).toBe("http://localhost:8080/api");
  });

  it("falls back to the sibling API port when nothing was baked", async () => {
    expect(
      await resolveApiBase({ hostname: "localhost", port: "5174" }),
    ).toBe("http://localhost:8080/api");
  });
});

describe("getDefaultApiBaseUrl — the Vite dev server is unaffected", () => {
  it("uses the dev API port on localhost:5173 when nothing is baked", async () => {
    expect(
      await resolveApiBase({ hostname: "localhost", port: "5173" }),
    ).toBe("http://localhost:4000/api");
  });

  it("uses the dev API port on localhost:5173 despite a stale LAN baked value", async () => {
    expect(
      await resolveApiBase({
        hostname: "localhost",
        port: "5173",
        baked: "http://192.168.1.103:8080/api",
      }),
    ).toBe("http://localhost:4000/api");
  });
});
