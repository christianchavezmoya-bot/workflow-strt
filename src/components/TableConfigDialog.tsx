import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { ArrowDownward, ArrowUpward, DeleteOutline, EditOutlined } from "@mui/icons-material";
import { useState } from "react";
import { TableConfig, TableField } from "../hooks/useTableConfig";

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
  onAddField?: (fieldId: string) => void;
  onCreateField?: (name: string, type: string, linkToFieldId?: string | null, actionType?: string | null) => void;
  onEditField?: (fieldId: string, name: string, type: string, linkToFieldId?: string | null, actionType?: string | null) => void;
  onDeleteField?: (fieldId: string) => void;
  builtInColumns?: Array<{ id: string; name: string; type: string; required?: boolean }>;
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
  builtInColumns = []
}: Props) => {
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [editField, setEditField] = useState<{ id: string; name: string; type: string; linkToFieldId?: string | null; actionType?: string | null } | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newFieldLinkTo, setNewFieldLinkTo] = useState<string>("");
  const [newFieldAction, setNewFieldAction] = useState<string>("");
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);
  const linkableTypes = new Set(["reference", "lookup field", "composite key", "dropdown", "multi-select"]);
  const linkTargetOptions = Array.from(
    new Map(
      [...(availableFields || []), ...fields.map((field) => ({ id: field.id, name: field.name, fieldType: field.type || "text" }))]
        .filter((field) => ["primary key", "composite key", "lookup field"].includes(field.fieldType))
        .map((field) => [field.id, field])
    ).values()
  );
  const getActionOptions = (type: string) => {
    if (type === "image") return ["upload image"];
    if (type === "file") return ["upload file"];
    if (type === "reference") return ["open referenced record", "filter by reference", "navigate to reference"];
    if (type === "lookup field") return ["open linked table", "create linked table"];
    return [];
  };
  const fieldMetaById = new Map(
    [
      ...(availableFields || []),
      ...fields.map((field) => ({
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

  const toggleHidden = (id: string) => {
    const hidden = new Set(config.hidden);
    if (hidden.has(id)) {
      hidden.delete(id);
    } else {
      hidden.add(id);
    }
    onChange({ ...config, hidden: Array.from(hidden) });
  };

  const getOrderedList = () => {
    const builtInIds = builtInColumns.map((col) => col.id);
    const dynamicIds = fields.map((field) => field.id);
    const allIds = [...builtInIds, ...dynamicIds];

    if (config.order.length) {
      const order = [...config.order];
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
        return { ...builtIn, isBuiltIn: true };
      }
      const dynamic = fields.find((field) => field.id === id);
      if (dynamic) {
        return { ...dynamic, isBuiltIn: false };
      }
      return null;
    }).filter((col): col is NonNullable<typeof col> => col !== null);
  };

  const move = (id: string, direction: "up" | "down") => {
    const order = getOrderedList();
    const index = order.indexOf(id);
    if (index === -1) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= order.length) return;
    const next = [...order];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange({ ...config, order: next });
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
    onChange({ ...config, order: next });
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
                  {(availableFields || []).map((field) => (
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
                  if (typeof onAddField === "function") {
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
                <Select value={newFieldType} onChange={(event) => setNewFieldType(event.target.value)}>
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
                  value={newFieldAction}
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
                  if (!trimmed || typeof onCreateField !== "function") return;
                  onCreateField(
                    trimmed,
                    newFieldType,
                    linkableTypes.has(newFieldType) ? (newFieldLinkTo || null) : null,
                    getActionOptions(newFieldType).length ? (newFieldAction || null) : null
                  );
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
            const isHidden = config.hidden.includes(column.id);
            const isBuiltIn = 'isBuiltIn' in column && column.isBuiltIn;
            const isRequired = isBuiltIn && 'required' in column && column.required;
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
                    {isBuiltIn && <Typography component="span" variant="caption" sx={{ ml: 1, color: "rgba(255, 159, 69, 0.8)" }}>(Built-in)</Typography>}
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
                  {!isBuiltIn && (
                    <>
                      <IconButton
                        size="small"
                        onClick={() => {
                          const meta = fieldMetaById.get(column.id);
                          setEditField({
                            id: column.id,
                            name: column.name,
                            type: column.type || "text",
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
                          if (typeof onDeleteField === "function") {
                            onDeleteField(column.id);
                          }
                        }}
                      >
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onClose}>
          Save & Close
        </Button>
      </DialogActions>

      <Dialog open={!!editField} onClose={() => setEditField(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit field</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ marginTop: 1 }}>
            <TextField
              label="Field name"
              value={editField?.name || ""}
              onChange={(event) =>
                setEditField((prev) => (prev ? { ...prev, name: event.target.value } : prev))
              }
              fullWidth
              InputLabelProps={{ sx: fieldLabelStyle }}
            />
            <FormControl fullWidth>
              <Select
                value={editField?.type || "text"}
                onChange={(event) =>
                  setEditField((prev) => (prev ? { ...prev, type: event.target.value } : prev))
                }
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
            <FormControl fullWidth disabled={getActionOptions(editField?.type || "text").length === 0}>
              <Select
                displayEmpty
                value={editField?.actionType || ""}
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
              if (typeof onEditField === "function") {
                onEditField(
                  editField.id,
                  editField.name,
                  editField.type,
                  linkableTypes.has(editField.type) ? (editField.linkToFieldId || null) : null,
                  getActionOptions(editField.type).length ? (editField.actionType || null) : null
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
