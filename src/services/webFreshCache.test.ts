import { describe, it, expect, beforeEach } from "vitest";
import {
  webCachedGet,
  invalidateWebCacheByPrefix,
  invalidateWebCache,
  peekWebSessionCache,
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

describe("webCachedGet persistSession", () => {
  beforeEach(() => {
    _clearWebCacheForTests();
    sessionStorage.clear();
  });

  it("returns session snapshot instantly and refreshes in background", async () => {
    const key = "/project-assets/by-project/P1?page=1";
    sessionStorage.setItem(`webSession:${key}`, JSON.stringify("session-v1"));

    let resolveNetwork: (value: string) => void = () => {};
    const networkPromise = new Promise<string>((resolve) => {
      resolveNetwork = resolve;
    });
    let fetchStarted = false;

    const result = await webCachedGet(
      key,
      async () => {
        fetchStarted = true;
        return networkPromise;
      },
      { ttlMs: 5_000, persistSession: true },
    );

    expect(result).toBe("session-v1");
    expect(fetchStarted).toBe(true);
    expect(peekWebSessionCache<string>(key)).toBe("session-v1");

    resolveNetwork("network-v1");
    await networkPromise;
    await new Promise((r) => setTimeout(r, 0));
    expect(peekWebSessionCache<string>(key)).toBe("network-v1");
  });

  it("invalidateWebCache clears session snapshot", async () => {
    const key = "/runs-summary/P1";
    await webCachedGet(key, async () => "v1", { persistSession: true });
    expect(peekWebSessionCache<string>(key)).toBe("v1");
    invalidateWebCache(key);
    expect(peekWebSessionCache<string>(key)).toBeNull();
  });
});
