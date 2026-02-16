import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { ArrowDownward, ArrowUpward, DeleteOutline, EditOutlined } from "@mui/icons-material";
import { useEffect, useMemo, useState } from "react";
import { TableConfig, TableField } from "../hooks/useTableConfig";
import type { FieldDefinition } from "../services/fieldService";

// Style for field definition labels (yellow bold)
const fieldLabelStyle = {
  color: '#FFD700',
  fontWeight: 'bold'
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: TableField[];
  config: TableConfig;
  onChange: (next: TableConfig) => void;
  availableFields?: Array<{ id: string; name: string; fieldType: string; linkToFieldId?: string | null; actionType?: string | null }>;
  onAddField?: (fieldId: string) => void | Promise<void>;
  onCreateField?: (
    name: string,
    type: string,
    linkToFieldId?: string | null,
    actionType?: string | null
  ) => void | FieldDefinition | Promise<void | FieldDefinition>;
  onEditField?: (
    fieldId: string,
    name: string,
    type: string,
    linkToFieldId?: string | null,
    actionType?: string | null
  ) => void | Promise<void>;
  onDeleteField?: (fieldId: string) => void | Promise<void>;
  builtInColumns?: Array<{ id: string; name: string; type: string; required?: boolean }>;

  // When true, field add/create/edit/remove are staged locally and only committed on "Save & Close".
  // (Table order/visibility are already staged via draftConfig.)
  deferFieldChanges?: boolean;
};

const TableConfigDialog = ({
  open,
  onClose,
  title,
  fields,
  config,
  onChange,
  availableFields,
  onAddField,
  onCreateField,
  onEditField,
  onDeleteField,
  builtInColumns = [],
  deferFieldChanges = false
}: Props) => {
  const [draftConfig, setDraftConfig] = useState<TableConfig>(config);
  const [draftFields, setDraftFields] = useState<TableField[]>(fields);
  const [draftAvailableFields, setDraftAvailableFields] = useState<
    Array<{ id: string; name: string; fieldType: string; linkToFieldId?: string | null; actionType?: string | null }>
  >(availableFields || []);
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [editField, setEditField] = useState<{
    id: string;
    originalId?: string;
    name: string;
    type: string;
    isBuiltIn?: boolean;
    linkToFieldId?: string | null;
    actionType?: string | null;
  } | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newFieldLinkTo, setNewFieldLinkTo] = useState<string>("");
  const [newFieldAction, setNewFieldAction] = useState<string>("");
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [initialDynamicIds, setInitialDynamicIds] = useState<string[]>([]);
  const [pendingAdds, setPendingAdds] = useState<Record<string, true>>({});
  const [pendingRemoves, setPendingRemoves] = useState<Record<string, true>>({});
  const [pendingEdits, setPendingEdits] = useState<
    Record<string, { name: string; type: string; linkToFieldId?: string | null; actionType?: string | null }>
  >({});
  const [pendingCreates, setPendingCreates] = useState<
    Record<
      string,
      { name: string; type: string; linkToFieldId?: string | null; actionType?: string | null; createdId?: string }
    >
  >({});
  const [pendingCreateOrder, setPendingCreateOrder] = useState<string[]>([]);
  const linkableTypes = new Set(["reference", "lookup field", "composite key", "dropdown", "multi-select"]);
  const effectiveFields = deferFieldChanges ? draftFields : fields;
  const effectiveAvailableFields = deferFieldChanges ? draftAvailableFields : (availableFields || []);
  const availableFieldsSorted = useMemo(
    () =>
      [...effectiveAvailableFields].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
      ),
    [effectiveAvailableFields]
  );
  const linkTargetOptions = Array.from(
    new Map(
      [
        ...effectiveAvailableFields,
        ...effectiveFields.map((field) => ({ id: field.id, name: field.name, fieldType: field.type || "text" }))
      ]
        .filter((field) => ["primary key", "composite key", "lookup field"].includes(field.fieldType))
        .map((field) => [field.id, field])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  const getActionOptions = (type: string) => {
    if (type === "image") return ["upload image"];
    if (type === "file") return ["upload file"];
    if (type === "reference") return ["open referenced record", "filter by reference", "navigate to reference"];
    if (type === "lookup field") return ["open linked table", "create linked table"];
    return [];
  };
  const normalizeAction = (type: string, actionType?: string | null) => {
    const action = (actionType || "").trim();
    if (!action) return "";
    const options = getActionOptions(type);
    return options.includes(action) ? action : "";
  };
  const fieldMetaById = new Map(
    [
      ...effectiveAvailableFields,
      ...effectiveFields.map((field) => ({
        id: field.id,
        name: field.name,
        fieldType: field.type || "text",
        linkToFieldId: field.linkToFieldId ?? null,
        actionType: field.actionType ?? null
      }))
    ].map((field) => [field.id, field])
  );
  const fieldTypes = [
    "text",
    "number",
    "date",
    "checkbox",
    "primary key",
    "composite key",
    "reference",
    "lookup field",
    "rollup",
    "formula",
    "json",
    "user",
    "single select",
    "percentage",
    "image",
    "location",
    "file",
    "dropdown",
    "multi-select",
    "email",
    "phone",
    "currency"
  ];

  useEffect(() => {
    if (!open) return;
    setDraftConfig({
      ...config,
      baseFieldNames: config.baseFieldNames || {},
      baseFieldMeta: config.baseFieldMeta || {}
    });
    setDraftFields(fields);
    setDraftAvailableFields(availableFields || []);
    setInitialDynamicIds(fields.map((f) => f.id));
    setPendingAdds({});
    setPendingRemoves({});
    setPendingEdits({});
    setPendingCreates({});
    setPendingCreateOrder([]);
    setSaving(false);
  }, [open, config]);

  const toggleHidden = (id: string) => {
    const hidden = new Set(draftConfig.hidden);
    if (hidden.has(id)) {
      hidden.delete(id);
    } else {
      hidden.add(id);
    }
    setDraftConfig({ ...draftConfig, hidden: Array.from(hidden) });
  };

  const getOrderedList = () => {
    const builtInIds = builtInColumns.map((col) => col.id);
    const dynamicIds = effectiveFields.map((field) => field.id);
    const allIds = [...builtInIds, ...dynamicIds];

    if (draftConfig.order.length) {
      const order = [...draftConfig.order];
      const remaining = allIds.filter((id) => !order.includes(id));
      return [...order, ...remaining];
    }

    return allIds;
  };

  const getAllColumns = () => {
    const orderedList = getOrderedList();
    return orderedList.map((id) => {
      const builtIn = builtInColumns.find((col) => col.id === id);
      if (builtIn) {
        const overrideName = draftConfig.baseFieldNames?.[id];
        const overrideType = draftConfig.baseFieldMeta?.[id]?.fieldType;
        return { ...builtIn, name: overrideName || builtIn.name, type: overrideType || builtIn.type, isBuiltIn: true };
      }
      const dynamic = effectiveFields.find((field) => field.id === id);
      if (dynamic) {
        return { ...dynamic, isBuiltIn: false };
      }
      return null;
    }).filter((col): col is NonNullable<typeof col> => col !== null);
  };

  const dropColumnFromDraftConfig = (fieldId: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      order: prev.order.filter((id) => id !== fieldId),
      hidden: prev.hidden.filter((id) => id !== fieldId)
    }));
  };

  const tempIdPrefix = "__new__";
  const makeTempId = () => `${tempIdPrefix}${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const stageAddExisting = (fieldId: string) => {
    const meta = effectiveAvailableFields.find((f) => f.id === fieldId);
    if (!meta) return;

    setDraftFields((prev) => [
      ...prev,
      {
        id: meta.id,
        name: meta.name,
        type: meta.fieldType,
        linkToFieldId: meta.linkToFieldId ?? null,
        actionType: meta.actionType ?? null
      }
    ]);
    setDraftAvailableFields((prev) => prev.filter((f) => f.id !== fieldId));
    setDraftConfig((prev) => ({ ...prev, hidden: prev.hidden.filter((id) => id !== fieldId) }));

    setPendingRemoves((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
    setPendingAdds((prev) => ({ ...prev, [fieldId]: true }));
  };

  const stageRemoveExisting = (fieldId: string) => {
    setDraftFields((prev) => prev.filter((f) => f.id !== fieldId));
    setDraftAvailableFields((prev) => {
      // If it's already in available list, do nothing; otherwise add it back (best-effort meta from current).
      if (prev.some((f) => f.id === fieldId)) return prev;
      const current = effectiveFields.find((f) => f.id === fieldId);
      if (!current) return prev;
      return [
        ...prev,
        {
          id: current.id,
          name: current.name,
          fieldType: current.type || "text",
          linkToFieldId: current.linkToFieldId ?? null,
          actionType: current.actionType ?? null
        }
      ];
    });
    dropColumnFromDraftConfig(fieldId);

    setPendingEdits((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });

    // If user added this existing field during this session, net effect is "no-op".
    setPendingAdds((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });

    const existedAtOpen = initialDynamicIds.includes(fieldId);
    if (existedAtOpen) setPendingRemoves((prev) => ({ ...prev, [fieldId]: true }));
  };

  const stageCreateField = (name: string, type: string, linkToFieldId?: string | null, actionType?: string | null) => {
    const tempId = makeTempId();
    setDraftFields((prev) => [
      ...prev,
      { id: tempId, name, type, linkToFieldId: linkToFieldId ?? null, actionType: actionType ?? null }
    ]);
    setPendingCreates((prev) => ({
      ...prev,
      [tempId]: { name, type, linkToFieldId: linkToFieldId ?? null, actionType: actionType ?? null }
    }));
    setPendingCreateOrder((prev) => [...prev, tempId]);
  };

  const stageEditField = (
    fieldId: string,
    name: string,
    type: string,
    linkToFieldId?: string | null,
    actionType?: string | null
  ) => {
    setDraftFields((prev) =>
      prev.map((f) =>
        f.id === fieldId ? { ...f, name, type, linkToFieldId: linkToFieldId ?? null, actionType: actionType ?? null } : f
      )
    );
    if (pendingCreates[fieldId]) {
      setPendingCreates((prev) => ({
        ...prev,
        [fieldId]: { ...prev[fieldId], name, type, linkToFieldId: linkToFieldId ?? null, actionType: actionType ?? null }
      }));
      return;
    }
    setPendingEdits((prev) => ({
      ...prev,
      [fieldId]: { name, type, linkToFieldId: linkToFieldId ?? null, actionType: actionType ?? null }
    }));
  };

  const stageRemoveTempCreate = (tempId: string) => {
    setDraftFields((prev) => prev.filter((f) => f.id !== tempId));
    dropColumnFromDraftConfig(tempId);
    setPendingCreates((prev) => {
      if (!prev[tempId]) return prev;
      const next = { ...prev };
      delete next[tempId];
      return next;
    });
    setPendingCreateOrder((prev) => prev.filter((id) => id !== tempId));
    setPendingEdits((prev) => {
      if (!prev[tempId]) return prev;
      const next = { ...prev };
      delete next[tempId];
      return next;
    });
  };

  const replaceIdInDraftConfig = (fromId: string, toId: string) => {
    setDraftConfig((prev) => {
      const mapKey = (key: string) => (key === fromId ? toId : key);
      const baseFieldNamesNext: Record<string, string> = {};
      for (const [key, value] of Object.entries(prev.baseFieldNames || {})) {
        baseFieldNamesNext[mapKey(key)] = value;
      }
      const baseFieldMetaNext: Record<string, { fieldType?: string | null; required?: boolean; options?: string[] | null }> = {};
      for (const [key, value] of Object.entries(prev.baseFieldMeta || {})) {
        baseFieldMetaNext[mapKey(key)] = value;
      }

      return {
        ...prev,
        order: (prev.order || []).map(mapKey),
        hidden: (prev.hidden || []).map(mapKey),
        baseFieldNames: baseFieldNamesNext,
        baseFieldMeta: baseFieldMetaNext
      };
    });
  };

  const stageReplaceExisting = (fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return;
    if (draftFields.some((f) => f.id === toId)) return; // no duplicates

    const nextMeta = fieldMetaById.get(toId);
    if (!nextMeta) return;

    setDraftFields((prev) => {
      const idx = prev.findIndex((f) => f.id === fromId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = {
        id: toId,
        name: nextMeta.name,
        type: nextMeta.fieldType,
        linkToFieldId: nextMeta.linkToFieldId ?? null,
        actionType: nextMeta.actionType ?? null
      };
      return next;
    });

    // Make "from" available again and remove "to" from available list.
    setDraftAvailableFields((prev) => {
      const next = prev.filter((f) => f.id !== toId);
      const fromMeta = fieldMetaById.get(fromId);
      if (fromMeta && !next.some((f) => f.id === fromId)) {
        next.push({
          id: fromMeta.id,
          name: fromMeta.name,
          fieldType: fromMeta.fieldType,
          linkToFieldId: fromMeta.linkToFieldId ?? null,
          actionType: fromMeta.actionType ?? null
        });
      }
      return next;
    });

    replaceIdInDraftConfig(fromId, toId);

    // pending ops: remove old, add new (net effect is swap membership)
    setPendingEdits((prev) => {
      if (!prev[fromId]) return prev;
      const next = { ...prev };
      delete next[fromId];
      return next;
    });
    setPendingAdds((prev) => ({ ...prev, [toId]: true }));
    if (initialDynamicIds.includes(fromId)) {
      setPendingRemoves((prev) => ({ ...prev, [fromId]: true }));
    }
  };

  const stageReplaceBaseWithExisting = (baseId: string, toId: string) => {
    if (!baseId || !toId || baseId === toId) return;
    if (draftFields.some((f) => f.id === toId)) return; // no duplicates

    const nextMeta = fieldMetaById.get(toId);
    if (!nextMeta) return;

    // Ensure new field is in the table's dynamic field list.
    setDraftFields((prev) => {
      if (prev.some((f) => f.id === toId)) return prev;
      return [
        ...prev,
        {
          id: toId,
          name: nextMeta.name,
          type: nextMeta.fieldType,
          linkToFieldId: nextMeta.linkToFieldId ?? null,
          actionType: nextMeta.actionType ?? null
        }
      ];
    });
    setDraftAvailableFields((prev) => prev.filter((f) => f.id !== toId));

    // Put the replacement field where the base column was, and hide the base column so it doesn't re-appear.
    setDraftConfig((prev) => {
      const orderSource = prev.order?.length ? [...prev.order] : [];
      const nextOrder = orderSource.length
        ? orderSource.map((id) => (id === baseId ? toId : id))
        : [toId];

      const hidden = new Set(prev.hidden || []);
      hidden.add(baseId);
      hidden.delete(toId);

      return {
        ...prev,
        order: nextOrder,
        hidden: Array.from(hidden)
      };
    });

    setPendingAdds((prev) => ({ ...prev, [toId]: true }));
  };

  const move = (id: string, direction: "up" | "down") => {
    const order = getOrderedList();
    const index = order.indexOf(id);
    if (index === -1) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= order.length) return;
    const next = [...order];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setDraftConfig({ ...draftConfig, order: next });
  };

  const moveTo = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const order = getOrderedList();
    const sourceIndex = order.indexOf(sourceId);
    const targetIndex = order.indexOf(targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const next = [...order];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDraftConfig({ ...draftConfig, order: next });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ marginTop: 1 }}>
          <Box>
            <Typography variant="subtitle2" sx={fieldLabelStyle}>Add field</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ marginTop: 1 }}>
              <FormControl size="small" fullWidth>
                <Select
                  value={selectedFieldId}
                  displayEmpty
                  onChange={(event) => setSelectedFieldId(event.target.value)}
                >
                  <MenuItem value="">
                    <em>Select a field</em>
                  </MenuItem>
                  {availableFieldsSorted.map((field) => (
                    <MenuItem key={field.id} value={field.id}>
                      {field.name} ({field.fieldType})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="contained"
                onClick={() => {
                  if (!selectedFieldId) return;
                  if (deferFieldChanges) {
                    stageAddExisting(selectedFieldId);
                  } else if (typeof onAddField === "function") {
                    onAddField(selectedFieldId);
                  }
                  setSelectedFieldId("");
                }}
              >
                Add
              </Button>
            </Stack>
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={fieldLabelStyle}>Create new field</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ marginTop: 1 }}>
              <TextField
                size="small"
                label="Field name"
                value={newFieldName}
                onChange={(event) => setNewFieldName(event.target.value)}
                fullWidth
                InputLabelProps={{ sx: fieldLabelStyle }}
              />
              <FormControl size="small" fullWidth>
                <Select
                  value={newFieldType}
                  onChange={(event) => {
                    const nextType = String(event.target.value || "text");
                    setNewFieldType(nextType);
                    if (!linkableTypes.has(nextType)) setNewFieldLinkTo("");
                    const allowed = getActionOptions(nextType);
                    if (allowed.length === 0 || !allowed.includes(newFieldAction)) setNewFieldAction("");
                  }}
                >
                  {fieldTypes.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth disabled={!linkableTypes.has(newFieldType)}>
                <Select
                  value={newFieldLinkTo}
                  displayEmpty
                  onChange={(event) => setNewFieldLinkTo(event.target.value)}
                >
                  <MenuItem value="">
                    <em>Link to</em>
                  </MenuItem>
                  {linkTargetOptions.map((field) => (
                    <MenuItem key={field.id} value={field.id}>
                      {field.name} ({field.fieldType})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth disabled={getActionOptions(newFieldType).length === 0}>
                <Select
                  value={normalizeAction(newFieldType, newFieldAction)}
                  displayEmpty
                  onChange={(event) => setNewFieldAction(event.target.value)}
                >
                  <MenuItem value="">
                    <em>Action</em>
                  </MenuItem>
                  {getActionOptions(newFieldType).map((action) => (
                    <MenuItem key={action} value={action}>
                      {action}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="contained"
                disabled={!newFieldName.trim()}
                onClick={() => {
                  const trimmed = newFieldName.trim();
                  if (!trimmed) return;
                  if (deferFieldChanges) {
                    stageCreateField(
                      trimmed,
                      newFieldType,
                      linkableTypes.has(newFieldType) ? (newFieldLinkTo || null) : null,
                      getActionOptions(newFieldType).length ? (normalizeAction(newFieldType, newFieldAction) || null) : null
                    );
                  } else {
                    if (typeof onCreateField !== "function") return;
                    onCreateField(
                      trimmed,
                      newFieldType,
                      linkableTypes.has(newFieldType) ? (newFieldLinkTo || null) : null,
                      getActionOptions(newFieldType).length ? (normalizeAction(newFieldType, newFieldAction) || null) : null
                    );
                  }
                  setNewFieldName("");
                  setNewFieldType("text");
                  setNewFieldLinkTo("");
                  setNewFieldAction("");
                }}
              >
                Create
              </Button>
            </Stack>
          </Box>
          {builtInColumns.length === 0 && fields.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No fields available.
            </Typography>
          )}
          {getAllColumns().map((column) => {
            const isHidden = draftConfig.hidden.includes(column.id);
            const isBuiltIn = 'isBuiltIn' in column && column.isBuiltIn;
            const isRequired = !!draftConfig.baseFieldMeta?.[column.id]?.required;
            return (
              <Box
                key={column.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  border: dragFieldId === column.id ? "2px solid" : "1px solid rgba(255,255,255,0.08)",
                  borderColor: dragFieldId === column.id ? "primary.main" : "rgba(255,255,255,0.08)",
                  borderRadius: 1,
                  padding: 1,
                  cursor: "grab",
                  transition: "all 0.2s",
                  backgroundColor: dragFieldId === column.id ? "rgba(45, 212, 191, 0.1)" : isBuiltIn ? "rgba(255, 159, 69, 0.05)" : "transparent",
                  "&:hover": {
                    borderColor: "rgba(255,255,255,0.2)",
                    backgroundColor: isBuiltIn ? "rgba(255, 159, 69, 0.1)" : "rgba(255,255,255,0.04)"
                  }
                }}
                draggable
                onDragStart={() => setDragFieldId(column.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!dragFieldId) return;
                  moveTo(dragFieldId, column.id);
                  setDragFieldId(null);
                }}
              >
                <Checkbox checked={!isHidden} onChange={() => toggleHidden(column.id)} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={fieldLabelStyle}>
                    {column.name}{isRequired ? " *" : ""}
                    {isBuiltIn && <Typography component="span" variant="caption" sx={{ ml: 1, color: "rgba(255, 159, 69, 0.8)" }}>(Base)</Typography>}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {column.type || "text"}
                    {!isBuiltIn && fieldMetaById.get(column.id)?.actionType
                      ? ` · ${fieldMetaById.get(column.id)?.actionType}`
                      : ""}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.5}>
                  <IconButton size="small" onClick={() => move(column.id, "up")}>
                    <ArrowUpward fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => move(column.id, "down")}>
                    <ArrowDownward fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => {
                      const meta = fieldMetaById.get(column.id);
                      const configMeta = draftConfig.baseFieldMeta?.[column.id];
                      setEditField({
                        id: column.id,
                        originalId: column.id,
                        name: column.name,
                        type: (configMeta?.fieldType as string) || column.type || "text",
                        isBuiltIn,
                        linkToFieldId: meta?.linkToFieldId ?? null,
                        actionType: meta?.actionType ?? null
                      });
                    }}
                  >
                    <EditOutlined fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => {
                      if (isBuiltIn) {
                        // Removing a base/built-in column only hides it for this table.
                        setDraftConfig((prev) => {
                          const hidden = new Set(prev.hidden);
                          hidden.add(column.id);
                          return {
                            ...prev,
                            order: prev.order.filter((id) => id !== column.id),
                            hidden: Array.from(hidden)
                          };
                        });
                        return;
                      }

                      if (deferFieldChanges) {
                        if (column.id.startsWith(tempIdPrefix)) {
                          stageRemoveTempCreate(column.id);
                        } else {
                          stageRemoveExisting(column.id);
                        }
                      } else {
                        if (typeof onDeleteField === "function") {
                          onDeleteField(column.id);
                        }
                        setDraftConfig((prev) => ({
                          ...prev,
                          order: prev.order.filter((id) => id !== column.id),
                          hidden: prev.hidden.filter((id) => id !== column.id)
                        }));
                      }
                    }}
                  >
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          variant="outlined"
          onClick={() => {
            setDraftConfig(config);
            setDraftFields(fields);
            setDraftAvailableFields(availableFields || []);
            setPendingAdds({});
            setPendingRemoves({});
            setPendingEdits({});
            setPendingCreates({});
            setPendingCreateOrder([]);
            onClose();
          }}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            if (!deferFieldChanges) {
              onChange(draftConfig);
              onClose();
              return;
            }

            const commit = async () => {
              setSaving(true);
              try {
                const tempIdToCreatedId: Record<string, string> = {};

                // Create new fields first so we can map temp ids to real ids for table config.
                for (const tempId of pendingCreateOrder) {
                  const create = pendingCreates[tempId];
                  if (!create) continue;
                  if (typeof onCreateField !== "function") continue;
                  const created = await onCreateField(
                    create.name,
                    create.type,
                    linkableTypes.has(create.type) ? (create.linkToFieldId || null) : null,
                    getActionOptions(create.type).length ? (normalizeAction(create.type, create.actionType) || null) : null
                  );
                  const createdId = (created as FieldDefinition | undefined)?.id;
                  if (createdId) tempIdToCreatedId[tempId] = createdId;
                }

                // Add existing fields to this table.
                for (const fieldId of Object.keys(pendingAdds)) {
                  if (typeof onAddField !== "function") continue;
                  await onAddField(fieldId);
                }

                // Edit existing fields (skip removed and temp ids).
                for (const [fieldId, edit] of Object.entries(pendingEdits)) {
                  if (fieldId.startsWith(tempIdPrefix)) continue;
                  if (pendingRemoves[fieldId]) continue;
                  if (typeof onEditField !== "function") continue;
                  await onEditField(
                    fieldId,
                    edit.name,
                    edit.type,
                    linkableTypes.has(edit.type) ? (edit.linkToFieldId || null) : null,
                    getActionOptions(edit.type).length ? (normalizeAction(edit.type, edit.actionType) || null) : null
                  );
                }

                // Remove existing fields from this table.
                for (const fieldId of Object.keys(pendingRemoves)) {
                  if (typeof onDeleteField !== "function") continue;
                  await onDeleteField(fieldId);
                }

                // Apply table config with temp ids swapped to created ids.
                const mapKey = (id: string) => tempIdToCreatedId[id] || id;

                const mappedBaseFieldNames: Record<string, string> = {};
                for (const [key, value] of Object.entries(draftConfig.baseFieldNames || {})) {
                  const nextKey = mapKey(key);
                  if (!nextKey.startsWith(tempIdPrefix)) mappedBaseFieldNames[nextKey] = value;
                }

                const mappedBaseFieldMeta: Record<string, { fieldType?: string | null; required?: boolean; options?: string[] | null }> = {};
                for (const [key, value] of Object.entries(draftConfig.baseFieldMeta || {})) {
                  const nextKey = mapKey(key);
                  if (!nextKey.startsWith(tempIdPrefix)) mappedBaseFieldMeta[nextKey] = value;
                }

                const mapped: TableConfig = {
                  ...draftConfig,
                  order: draftConfig.order
                    .map((id) => mapKey(id))
                    .filter((id) => !id.startsWith(tempIdPrefix)),
                  hidden: draftConfig.hidden
                    .map((id) => mapKey(id))
                    .filter((id) => !id.startsWith(tempIdPrefix))
                };
                mapped.baseFieldNames = mappedBaseFieldNames;
                mapped.baseFieldMeta = mappedBaseFieldMeta;

                onChange(mapped);
                onClose();
              } catch (e) {
                console.error("Failed to commit field/table config changes:", e);
              } finally {
                setSaving(false);
              }
            };

            void commit();
          }}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save & Close"}
        </Button>
      </DialogActions>

      <Dialog open={!!editField} onClose={() => setEditField(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit field</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={!!draftConfig.baseFieldMeta?.[editField?.id || ""]?.required}
                  onChange={(event) => {
                    if (!editField) return;
                    setDraftConfig((prev) => ({
                      ...prev,
                      baseFieldMeta: {
                        ...(prev.baseFieldMeta || {}),
                        [editField.id]: {
                          ...(prev.baseFieldMeta?.[editField.id] || {}),
                          required: event.target.checked
                        }
                      }
                    }));
                  }}
                />
              }
              label="Required"
            />

            <Autocomplete
              freeSolo
              options={Array.from(fieldMetaById.values()).sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
              )}
              value={fieldMetaById.get(editField?.id || "") || null}
              inputValue={editField?.name || ""}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
              getOptionDisabled={(opt) => {
                const isInTable = draftFields.some((f) => f.id === opt.id);
                const isCurrent = opt.id === (editField?.id || "");
                const isOriginal = opt.id === (editField?.originalId || "");
                return isInTable && !isOriginal && !isCurrent;
              }}
              renderOption={(props, opt) => (
                <li {...props} key={opt.id}>
                  {opt.name} ({opt.fieldType})
                </li>
              )}
              onChange={(_, option) => {
                if (!editField) return;
                if (!option || typeof option === "string") return;
                const nextMeta = fieldMetaById.get(option.id);
                if (!nextMeta) return;
                setEditField((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    id: nextMeta.id,
                    name: nextMeta.name,
                    type: nextMeta.fieldType,
                    linkToFieldId: nextMeta.linkToFieldId ?? null,
                    actionType: nextMeta.actionType ?? null
                  };
                });
              }}
              onInputChange={(_, value, reason) => {
                // Allow typing to rename without changing the underlying field id.
                if (reason === "reset") return;
                setEditField((prev) => (prev ? { ...prev, name: value } : prev));
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Field name"
                  fullWidth
                  InputLabelProps={{ sx: fieldLabelStyle }}
                />
              )}
            />
            <FormControl fullWidth>
              <Select
                value={editField?.type || "text"}
                onChange={(event) => {
                  const nextType = String(event.target.value || "text");
                  setEditField((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      type: nextType,
                      linkToFieldId: linkableTypes.has(nextType) ? (prev.linkToFieldId ?? null) : null,
                      actionType: normalizeAction(nextType, prev.actionType || "")
                    };
                  });
                }}
              >
                {fieldTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth disabled={!linkableTypes.has(editField?.type || "text")}>
              <Select
                displayEmpty
                value={editField?.linkToFieldId || ""}
                onChange={(event) =>
                  setEditField((prev) => (prev ? { ...prev, linkToFieldId: event.target.value } : prev))
                }
              >
                <MenuItem value="">
                  <em>Link to</em>
                </MenuItem>
                {linkTargetOptions.map((field) => (
                  <MenuItem key={field.id} value={field.id}>
                    {field.name} ({field.fieldType})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl
              fullWidth
              disabled={getActionOptions(editField?.type || "text").length === 0}
            >
              <Select
                displayEmpty
                value={normalizeAction(editField?.type || "text", editField?.actionType || "")}
                onChange={(event) =>
                  setEditField((prev) => (prev ? { ...prev, actionType: event.target.value } : prev))
                }
              >
                <MenuItem value="">
                  <em>Action</em>
                </MenuItem>
                {getActionOptions(editField?.type || "text").map((action) => (
                  <MenuItem key={action} value={action}>
                    {action}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setEditField(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!editField) return;
              const trimmed = (editField.name || "").trim();
              if (!trimmed) return;

              // If user selected a different field in the dropdown, treat this as a replace operation.
              if (!editField.isBuiltIn && editField.originalId && editField.id !== editField.originalId) {
                if (deferFieldChanges) {
                  stageReplaceExisting(editField.originalId, editField.id);
                  // Apply edits to the replacement field too (global definition).
                  stageEditField(
                    editField.id,
                    trimmed,
                    editField.type,
                    linkableTypes.has(editField.type) ? (editField.linkToFieldId || null) : null,
                    getActionOptions(editField.type).length ? (normalizeAction(editField.type, editField.actionType) || null) : null
                  );
                } else {
                  const commitReplace = async () => {
                    try {
                      if (typeof onDeleteField === "function") {
                        await onDeleteField(editField.originalId as string);
                      }
                      if (typeof onAddField === "function") {
                        await onAddField(editField.id);
                      }
                      if (typeof onEditField === "function") {
                        await onEditField(
                          editField.id,
                          trimmed,
                          editField.type,
                          linkableTypes.has(editField.type) ? (editField.linkToFieldId || null) : null,
                          getActionOptions(editField.type).length ? (normalizeAction(editField.type, editField.actionType) || null) : null
                        );
                      }
                    } catch (e) {
                      console.error("Failed to replace field:", e);
                    }
                  };
                  void commitReplace();
                }

                setEditField(null);
                return;
              }

              if (editField.isBuiltIn && editField.originalId && editField.id !== editField.originalId) {
                if (deferFieldChanges) {
                  stageReplaceBaseWithExisting(editField.originalId, editField.id);
                  stageEditField(
                    editField.id,
                    trimmed,
                    editField.type,
                    linkableTypes.has(editField.type) ? (editField.linkToFieldId || null) : null,
                    getActionOptions(editField.type).length ? (normalizeAction(editField.type, editField.actionType) || null) : null
                  );
                }
                setEditField(null);
                return;
              }

              setDraftConfig((prev) => ({
                ...prev,
                baseFieldNames: { ...(prev.baseFieldNames || {}), [editField.id]: trimmed },
                baseFieldMeta: {
                  ...(prev.baseFieldMeta || {}),
                  [editField.id]: {
                    ...(prev.baseFieldMeta?.[editField.id] || {}),
                    fieldType: editField.type
                  }
                }
              }));
              if (editField.isBuiltIn) {
                setEditField(null);
                return;
              }
              if (deferFieldChanges) {
                stageEditField(
                  editField.id,
                  editField.name,
                  editField.type,
                  linkableTypes.has(editField.type) ? (editField.linkToFieldId || null) : null,
                  getActionOptions(editField.type).length ? (normalizeAction(editField.type, editField.actionType) || null) : null
                );
              } else if (typeof onEditField === "function") {
                onEditField(
                  editField.id,
                  editField.name,
                  editField.type,
                  linkableTypes.has(editField.type) ? (editField.linkToFieldId || null) : null,
                  getActionOptions(editField.type).length ? (normalizeAction(editField.type, editField.actionType) || null) : null
                );
              }
              setEditField(null);
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default TableConfigDialog;


