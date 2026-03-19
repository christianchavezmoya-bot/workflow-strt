import {
  Box, Typography, Checkbox, FormControlLabel, Chip,
  Table, TableBody, TableCell, TableHead, TableRow, Paper,
} from "@mui/material";
import type { WorkbookSheet } from "../types/sourceWorkbook";

interface Props {
  sheets: WorkbookSheet[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function WorkbookSheetPicker({ sheets, selected, onChange }: Props) {
  const toggle = (name: string) => {
    onChange(
      selected.includes(name)
        ? selected.filter((s) => s !== name)
        : [...selected, name]
    );
  };

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Select Sheets to Import
      </Typography>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>Sheet Name</TableCell>
              <TableCell align="right">Rows</TableCell>
              <TableCell>Headers (preview)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sheets.map((s) => (
              <TableRow
                key={s.name}
                hover
                selected={selected.includes(s.name)}
                onClick={() => toggle(s.name)}
                sx={{ cursor: "pointer" }}
              >
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selected.includes(s.name)}
                    onChange={() => toggle(s.name)}
                    onClick={(e) => e.stopPropagation()}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>{s.name}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{s.rowCount}</Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {s.headers.slice(0, 6).map((h) => (
                      <Chip key={h} label={h} size="small" variant="outlined" />
                    ))}
                    {s.headers.length > 6 && (
                      <Chip label={`+${s.headers.length - 6}`} size="small" />
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
