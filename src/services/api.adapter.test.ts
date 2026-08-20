import { describe, expect, it } from "vitest";
import api from "./api";

describe("api GET coalescing adapter", () => {
  it("installs a function adapter so in-flight GETs can share one HTTP call", () => {
    // Axios 1.x defaults.adapter is ['xhr','http','fetch'] (an array). The
    // coalescing wrap must resolve that via getAdapter(), otherwise native
    // dashboard mounts fan out duplicate by-asset GETs.
    expect(typeof api.defaults.adapter).toBe("function");
  });
});
