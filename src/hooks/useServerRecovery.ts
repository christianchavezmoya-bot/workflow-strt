/**
 * useServerRecovery — fires a callback when the server becomes reachable again.
 *
 * Why this exists:
 *   Native document/file reads deliberately fast-bail while the health monitor
 *   has the server flagged unreachable (see documentService /
 *   assetDocumentLinkService). That guard is correct — it keeps the phone
 *   instant on a dead link instead of burning a 10s timeout per read — but it
 *   leaves a UI gap: a screen that happened to load during the unreachable
 *   window keeps its empty result forever, because nothing tells it to try
 *   again once the link comes back. That is the "files don't sync after a login
 *   timeout" symptom: the data was never missing, the screen just never asked
 *   a second time.
 *
 *   Fixing it in the view (ask again on recovery) is right; weakening the
 *   offline guard is not.
 *
 * Semantics:
 *   The callback fires only on a TRANSITION into reachable — not on every
 *   successful health ping. `runPingIfForeground` calls notify(true) on every
 *   30s ping while online, so subscribing naively would refetch every 30s
 *   forever. This hook tracks the previous value and ignores repeats.
 *
 *   It deliberately does NOT fire on mount for an already-reachable server: the
 *   view's own initial load covers that case.
 *
 * Usage:
 *   useServerRecovery(() => { void loadDocuments(); });
 */
import { useEffect, useRef } from "react";
import { subscribeServerReachable } from "../services/connectivityMonitor";

export function useServerRecovery(onRecovered: () => void): void {
  // Stable ref so the subscription never re-registers when the callback
  // changes identity between renders.
  const onRecoveredRef = useRef(onRecovered);
  onRecoveredRef.current = onRecovered;

  useEffect(() => {
    // `null` = never determined yet. Seeded from the first emission rather than
    // assumed, so a view mounting while already-unreachable still gets its
    // recovery callback when the link returns.
    let previous: boolean | null = null;

    const unsubscribe = subscribeServerReachable((reachable) => {
      const wasUnreachable = previous === false;
      previous = reachable;
      // Only a false -> true transition is a recovery worth refetching for.
      if (reachable && wasUnreachable) {
        onRecoveredRef.current();
      }
    });

    return unsubscribe;
  }, []);
}
