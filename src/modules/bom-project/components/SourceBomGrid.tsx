import { useState } from "react";
import {
  Box, Typography, Table, TableBody, TableCell, TableHead,
  TableRow, Paper, Chip, TextField, InputAdornment, Tooltip,
} from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import type { CanonicalBomRow } from "../types/canonicalBom";
import type { ClassificationResult } from "../types/classification";

const STATUS_COLOR: Record<string, "success" | "warning" | "error" | "default"> = {
  asset: "success",
  component: "primary" as any,
  consumable: "warning",
  reference: "default",
  ignore: "default",
};

interface Props {
  rows: CanonicalBomRow[];
  classifications: Map<string, ClassificationResult>;
  selectedRowId?: string;
  onRowClick?: (rowId: string) => void;
  showUnmatchedOnly?: boolean;
}

export default function SourceBomGrid({
  rows,
  classifications,
  selectedRowId,
  onRowClick,
  showUnmatchedOnly,
}: Props) {
  const [search, setSearch] = useState("");

  const filtered = rows.filter((r) => {
    if (showUnmatchedOnly && classifications.has(r.sourceRowId)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.description.toLowerCase().includes(q) ||
        (r.partNumber ?? "").toLowerCase().includes(q) ||
        (r.supplier ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Typography variant="subtitle2" fontWeight={600} mb={1}>
        Uploaded BOM — {rows.length} rows
      </Typography>

      <TextField
        size="small"
        placeholder="Search rows…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlinedIcon fontSize="small" /></InputAdornment> }}
        sx={{ mb: 1 }}
      />

      <Paper variant="outlined" sx={{ overflow: "auto", flex: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Part No.</TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell>Supplier</TableCell>
              <TableCell>Type</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((row) => {
              const cl = classifications.get(row.sourceRowId);
              const isSelected = selectedRowId === row.sourceRowId;
              return (
                <TableRow
                  key={row.sourceRowId}
                  hover
                  selected={isSelected}
                  onClick={() => onRowClick?.(row.sourceRowId)}
                  sx={{
                    cursor: "pointer",
                    borderLeft: isSelected ? "3px solid" : undefined,
                    borderLeftColor: "primary.main",
                  }}
                >
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">{row.rowIndex}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" fontFamily="monospace">
                      {row.partNumber ?? "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={row.description}>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>
                        {row.description}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption">{row.qty ?? "—"}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" noWrap>{row.supplier ?? "—"}</Typography>
                  </TableCell>
                  <TableCell>
                    {cl ? (
                      <Chip
                        label={cl.itemType}
                        size="small"
                        color={STATUS_COLOR[cl.itemType] ?? "default"}
                        variant="outlined"
                      />
                    ) : (
                      <Chip label="Unclassified" size="small" color="error" variant="outlined" />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
