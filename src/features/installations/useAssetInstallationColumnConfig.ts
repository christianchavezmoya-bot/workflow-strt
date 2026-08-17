import { useCallback, useMemo, useState } from "react";
import {
  loadColumnConfig,
  persistColumnConfig,
  resolveVisibleColumns,
  type ColumnConfig,
} from "./assetInstallationPageLogic";

export function useAssetInstallationColumnConfig(archiveMode: boolean) {
  const [colConfig, setColConfig] = useState<ColumnConfig>(loadColumnConfig);
  const [colSettingsOpen, setColSettingsOpen] = useState(false);
  const [settingsOrder, setSettingsOrder] = useState<string[]>([]);
  const [settingsHidden, setSettingsHidden] = useState<string[]>([]);

  const visibleColumns = useMemo(
    () => resolveVisibleColumns(colConfig, archiveMode),
    [colConfig, archiveMode],
  );

  const openColumnSettings = useCallback(() => {
    setSettingsOrder(colConfig.order);
    setSettingsHidden(colConfig.hidden);
    setColSettingsOpen(true);
  }, [colConfig]);

  const applyColumnSettings = useCallback(() => {
    const next: ColumnConfig = { order: settingsOrder, hidden: settingsHidden };
    setColConfig(next);
    persistColumnConfig(next);
    setColSettingsOpen(false);
  }, [settingsOrder, settingsHidden]);

  return {
    colConfig,
    colSettingsOpen,
    setColSettingsOpen,
    settingsOrder,
    setSettingsOrder,
    settingsHidden,
    setSettingsHidden,
    visibleColumns,
    openColumnSettings,
    applyColumnSettings,
  };
}
