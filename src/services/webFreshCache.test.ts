import { describe, it, expect, beforeEach } from "vitest";
import {
  webCachedGet,
  invalidateWebCacheByPrefix,
  _clearWebCacheForTests,
} from "./webFreshCache";

// Guards the mechanism the asset take-over fix depends on: after a write,
// invalidating the by-project/by-product LIST cache keys must force the next
// list read to re-fetch (so a reassignment can't be masked by a stale snapshot).
describe("invalidateWebCacheByPrefix", () => {
  beforeEach(() => _clearWebCacheForTests());

  it("forces a re-fetch of keys under the prefix, leaves others cached", async () => {
    const listKey = "/project-assets/by-project/P1";
    const otherKey = "/products";

    // Prime both caches.
    expect(await webCachedGet(listKey, async () => "list-v1")).toBe("list-v1");
    expect(await webCachedGet(otherKey, async () => "other-v1")).toBe("other-v1");

    // A write to an asset invalidates the list caches.
    invalidateWebCacheByPrefix("/project-assets/by-project/");

    // The list key is now a cache MISS → the new fetcher runs (fresh value).
    expect(await webCachedGet(listKey, async () => "list-v2")).toBe("list-v2");

    // The unrelated key is still a cache HIT → its stale-but-fresh fetcher is
    // NOT what's returned synchronously (value stays v1 until its own TTL/refresh).
    expect(await webCachedGet(otherKey, async () => "other-v2")).toBe("other-v1");
  });
});
