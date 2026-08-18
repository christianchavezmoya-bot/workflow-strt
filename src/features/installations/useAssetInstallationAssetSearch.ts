import { useCallback, useState } from "react";

export function useAssetInstallationAssetSearch() {
  const [assetSearchOpen, setAssetSearchOpen] = useState(false);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");

  const openAssetSearch = useCallback(() => {
    setAssetSearchQuery("");
    setAssetSearchOpen(true);
  }, []);

  const closeAssetSearch = useCallback(() => {
    setAssetSearchOpen(false);
  }, []);

  return {
    assetSearchOpen,
    setAssetSearchOpen,
    assetSearchQuery,
    setAssetSearchQuery,
    openAssetSearch,
    closeAssetSearch,
  };
}
