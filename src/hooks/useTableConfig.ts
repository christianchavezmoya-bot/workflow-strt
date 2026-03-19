import { useCallback, useEffect, useMemo, useState } from "react";
import { tableConfigService } from "../services/tableConfigService";

export type TableConfig = {
  order: string[];
  hidden: string[];
  baseFieldNames?: Record<string, string>;
  baseFieldMeta?: Record<
    string,
    {
      fieldType?: string | null;
      required?: boolean;
      options?: string[] | null;
      linkToFieldId?: string | null;
      actionType?: string | null;
    }
  >;
};

export type TableField = {
  id: string;
  name: string;
  type?: string;
  linkToFieldId?: string | null;
  actionType?: string | null;
};

const getLocalStorageKey = (tableKey: string) => `table_config_migration:${tableKey}`;

export const useTableConfig = (tableKey: string, fields: TableField[]) => {
  const [config, setConfig] = useState<TableConfig>({ order: [], hidden: [], baseFieldNames: {}, baseFieldMeta: {} });
  const [loading, setLoading] = useState(true);

  // Load config from backend
  useEffect(() => {
    if (!tableKey) return;

    const loadConfig = async () => {
      try {
        // Try to load from backend first
        const backendConfig = await tableConfigService.get(tableKey);
        setConfig({
          order: backendConfig.order || [],
          hidden: backendConfig.hidden || [],
          baseFieldNames: backendConfig.baseFieldNames || {},
          baseFieldMeta: backendConfig.baseFieldMeta || {}
        });

        // Check if there's localStorage data to migrate
        const localKey = getLocalStorageKey(tableKey);
        const localData = localStorage.getItem(localKey);
        if (localData) {
          try {
            const parsed = JSON.parse(localData) as TableConfig;
            // Merge local data with backend (local takes precedence for migration)
            const merged = {
              order: parsed.order?.length > 0 ? parsed.order : backendConfig.order || [],
              hidden: parsed.hidden?.length > 0 ? parsed.hidden : backendConfig.hidden || [],
              baseFieldNames: { ...backendConfig.baseFieldNames, ...parsed.baseFieldNames },
              baseFieldMeta: { ...backendConfig.baseFieldMeta, ...parsed.baseFieldMeta }
            };

            // Save merged config to backend
            await tableConfigService.update(tableKey, {
              tableName: tableKey,
              ...merged
            });
            setConfig(merged);

            // Remove from localStorage after migration
            localStorage.removeItem(localKey);
          } catch (e) {
            console.error("Failed to migrate localStorage config:", e);
          }
        }
      } catch (error) {
        console.error("Failed to load table config:", error);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, [tableKey]);

  // Save config to backend
  const saveConfig = useCallback(async (newConfig: TableConfig) => {
    setConfig(newConfig);
    if (!tableKey) return;
    try {
      await tableConfigService.update(tableKey, {
        tableName: tableKey,
        order: newConfig.order,
        hidden: newConfig.hidden,
        baseFieldNames: newConfig.baseFieldNames || {},
        baseFieldMeta: newConfig.baseFieldMeta || {}
      });
    } catch (error) {
      console.error("Failed to save table config:", error);
    }
  }, [tableKey]);

  const orderedFields = useMemo(() => {
    const byId = new Map(fields.map((field) => [field.id, field]));
    const ordered = config.order.map((id) => byId.get(id)).filter(Boolean) as TableField[];
    const remaining = fields.filter((field) => !config.order.includes(field.id));
    return [...ordered, ...remaining];
  }, [fields, config.order]);

  const visibleFields = useMemo(() => {
    const hidden = new Set(config.hidden);
    return orderedFields.filter((field) => !hidden.has(field.id));
  }, [orderedFields, config.hidden]);

  return { config, setConfig: saveConfig, visibleFields, orderedFields, loading };
};
