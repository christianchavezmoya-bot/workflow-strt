import {
  Box, Typography, Table, TableBody, TableCell, TableHead,
  TableRow, Paper, Select, MenuItem, Chip, FormControl, Tooltip,
} from "@mui/material";
import type { ColumnMappingEntry } from "../types/sourceWorkbook";
import type { CellValue } from "../types/sourceWorkbook";

const CANONICAL_FIELDS: { value: string; label: string; group: string }[] = [
  { value: "", label: "— Ignore —", group: "General" },
  { value: "partNumber", label: "Part Number", group: "Identification" },
  { value: "description", label: "Description", group: "Identification" },
  { value: "supplier", label: "Supplier", group: "Identification" },
  { value: "qty", label: "Qty", group: "Quantities" },
  { value: "unit", label: "Unit", group: "Quantities" },
  { value: "costUnit", label: "Cost / Unit", group: "Costing" },
  { value: "costExtended", label: "Cost Extended", group: "Costing" },
  { value: "listPriceUnit", label: "List Price / Unit", group: "Costing" },
  { value: "listPriceExtended", label: "List Price Extended", group: "Costing" },
  { value: "stockQty", label: "Stock Qty", group: "Inventory" },
  { value: "requiredQty", label: "Required Qty", group: "Inventory" },
  { value: "differenceQty", label: "Difference Qty", group: "Inventory" },
  { value: "vehicleType", label: "Vehicle / Asset Type", group: "Asset" },
  { value: "assetNameCandidate", label: "Asset Name", group: "Asset" },
  { value: "groupName", label: "Group / Section", group: "Asset" },
  { value: "itemScope", label: "Item Scope", group: "Asset" },
  { value: "notes", label: "Notes", group: "General" },
];

interface Props {
  mappings: ColumnMappingEntry[];
  sampleRows: Array<Record<string, CellValue>>;
  onChange: (mappings: ColumnMappingEntry[]) => void;
}

export default function ColumnMapper({ mappings, sampleRows, onChange }: Props) {
  const updateField = (sourceColumn: string, canonicalField: string) => {
    onChange(
      mappings.map((m) =>
        m.sourceColumn === sourceColumn ? { ...m, canonicalField } : m
      )
    );
  };

  const sample = (col: string) => sampleRows.slice(0, 3).map((r) => String(r[col] ?? "")).filter(Boolean);

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Map Columns to Canonical Fields
      </Typography>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Source Column</TableCell>
              <TableCell>Sample Values</TableCell>
              <TableCell>Map to Field</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mappings.map((m) => (
              <TableRow key={m.sourceColumn}>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>{m.sourceColumn}</Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {sample(m.sourceColumn).map((v, i) => (
                      <Chip key={i} label={v.slice(0, 30)} size="small" variant="outlined" />
                    ))}
                  </Box>
                </TableCell>
                <TableCell>
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <Select
                      value={m.canonicalField}
                      onChange={(e) => updateField(m.sourceColumn, e.target.value)}
                      displayEmpty
                    >
                      {CANONICAL_FIELDS.map((f) => (
                        <MenuItem key={f.value} value={f.value}>
                          {f.label}
                          {f.group !== "General" && (
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                              {f.group}
                            </Typography>
                          )}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </TableCell>
                <TableCell>
                  {m.canonicalField ? (
                    <Chip label="Mapped" color="success" size="small" />
                  ) : (
                    <Chip label="Ignored" size="small" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
