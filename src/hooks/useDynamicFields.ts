import { useCallback, useEffect, useMemo, useState } from "react";
import { fieldService, FieldDefinition, FieldValue } from "../services/fieldService";

export interface DynamicValue {
  id?: string;
  value: string;
}

export type ValuesByEntity = Record<string, Record<string, DynamicValue>>;

export const useDynamicFields = (table: string) => {
  const [definitions, setDefinitions] = useState<FieldDefinition[]>([]);
  const [valuesByEntity, setValuesByEntity] = useState<ValuesByEntity>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!table) return;
    setLoading(true);
    try {
      const [defs, values] = await Promise.all([
        fieldService.getDefinitions(),
        fieldService.getValuesForTable(table)
      ]);
      const filteredDefs = defs.filter((def) => def.isActive && def.tables?.includes(table));
      const map: ValuesByEntity = {};
      values.forEach((value) => {
        if (!map[value.entityId]) {
          map[value.entityId] = {};
        }
        map[value.entityId][value.fieldDefinitionId] = { id: value.id, value: value.value };
      });
      setDefinitions(filteredDefs);
      setValuesByEntity(map);
    } catch {
      setDefinitions([]);
      setValuesByEntity({});
    } finally {
      setLoading(false);
    }
  }, [table]);

  useEffect(() => {
    load();
  }, [load]);

  const upsertForEntity = useCallback(
    async (entityId: string, values: Record<string, string>, existing?: Record<string, DynamicValue>) => {
      const payload: FieldValue[] = Object.entries(values).map(([fieldDefinitionId, value]) => ({
        id: existing?.[fieldDefinitionId]?.id || "",
        fieldDefinitionId,
        tableName: table,
        entityId,
        value,
        updatedAt: new Date().toISOString()
      }));
      if (payload.length === 0) return [];
      const saved = await fieldService.upsertValues(payload);
      await load();
      return saved;
    },
    [load, table]
  );

  const definitionsById = useMemo(() => {
    const map = new Map<string, FieldDefinition>();
    definitions.forEach((def) => map.set(def.id, def));
    return map;
  }, [definitions]);

  return {
    definitions,
    definitionsById,
    valuesByEntity,
    setValuesByEntity,
    upsertForEntity,
    reload: load,
    loading
  };
};
