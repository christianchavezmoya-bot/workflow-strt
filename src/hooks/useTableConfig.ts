import { useEffect, useMemo, useState } from "react";

export type TableConfig = {
  order: string[];
  hidden: string[];
};

export type TableField = {
  id: string;
  name: string;
  type?: string;
  linkToFieldId?: string | null;
  actionType?: string | null;
};

const getStorageKey = (tableKey: string, userId: string) => `table_config:${userId}:${tableKey}`;

export const useTableConfig = (tableKey: string, userId: string, fields: TableField[]) => {
  const [config, setConfig] = useState<TableConfig>({ order: [], hidden: [] });

  useEffect(() => {
    if (!tableKey || !userId) return;
    const raw = localStorage.getItem(getStorageKey(tableKey, userId));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as TableConfig;
      setConfig({
        order: Array.isArray(parsed.order) ? parsed.order : [],
        hidden: Array.isArray(parsed.hidden) ? parsed.hidden : []
      });
    } catch {
      setConfig({ order: [], hidden: [] });
    }
  }, [tableKey, userId]);

  useEffect(() => {
    if (!tableKey || !userId) return;
    localStorage.setItem(getStorageKey(tableKey, userId), JSON.stringify(config));
  }, [config, tableKey, userId]);

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

  return { config, setConfig, visibleFields, orderedFields };
};
