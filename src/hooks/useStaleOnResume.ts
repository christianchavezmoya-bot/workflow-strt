/**
 * useStaleOnResume - fires a background data pull when entity data is older
 * than STALE_THRESHOLD_MS and the app comes to the foreground.
 *
 * Prerequisites:
 *   - Step 3 must be complete (syncMetaSet called in repositories after reads)
 *   - Step 4 must be complete (app-foregrounded event dispatched on native)
 *
 * The pull is a background operation. It does not block the UI, show a spinner,
 * or change any visible state. The repository pattern (stale-while-revalidate)
 * handles updating the UI when fresh data arrives.
 *
 * Usage:
 *   useStaleOnResume("assets", () => AssetRepository.getByProject(id).catch(() => {}));
 */
import { useEffect, useRef } from "react";
import { syncMetaGet } from "../services/localDB";

const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

export function useStaleOnResume(
  entityKey: string,
  onStale: () => void
): void {
  // Stable ref so the effect never re-registers when onStale changes identity
  const onStaleRef = useRef(onStale);
  onStaleRef.current = onStale;

  useEffect(() => {
    async function checkAndPull() {
      if (!navigator.onLine) return; // offline - no point pulling
      const lastSync = await syncMetaGet(entityKey);
      if (!lastSync) {
        // Never synced a read for this entity - pull now
        onStaleRef.current();
        return;
      }
      const ageMs = Date.now() - new Date(lastSync).getTime();
      if (ageMs > STALE_THRESHOLD_MS) {
        onStaleRef.current();
      }
    }

    // Check on mount
    void checkAndPull();

    // Re-check when native app foregrounds (requires Step 4)
    const handleForeground = () => void checkAndPull();
    window.addEventListener("app-foregrounded", handleForeground);

    // Re-check on browser tab visibility change (web fallback)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void checkAndPull();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("app-foregrounded", handleForeground);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [entityKey]); // entityKey is always a stable string literal at callsites
}
