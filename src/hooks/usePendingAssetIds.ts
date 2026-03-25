/**
 * usePendingAssetIds — returns the set of asset IDs that have queued
 * offline actions waiting to sync. Updates whenever the queue changes.
 */

import { useEffect, useState } from "react";
import { pendingAssetIds } from "../services/projectAssetService";

export function usePendingAssetIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());

  async function refresh() {
    setIds(await pendingAssetIds());
  }

  useEffect(() => {
    void refresh();
    const handler = () => void refresh();
    window.addEventListener("sync-pending-changed", handler);
    return () => window.removeEventListener("sync-pending-changed", handler);
  }, []);

  return ids;
}
