import { FileDownloadOutlined, PrintOutlined } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { ALL_PRINT_COLUMNS, type GroupByKey, type PrintRow } from "../../utils/assetListReportColumns";
import type { User } from "../../types/user";

export type PrintScope = "selection" | "visible" | "custom";

type Props = {
  open: boolean;
  generating: boolean;
  scope: PrintScope;
  selectedCount: number;
  visibleCount: number;
  printRows: PrintRow[];
  printColumns: (keyof PrintRow)[];
  printGroupBy: GroupByKey;
  printTechId: string;
  printModel: string;
  printStatuses: string[];
  printPendingSig: boolean;
  users: User[];
  onClose: () => void;
  onScopeChange: (scope: PrintScope) => void;
  onPrintTechIdChange: (techId: string) => void;
  onPrintModelChange: (model: string) => void;
  onPrintStatusesChange: (statuses: string[]) => void;
  onPrintPendingSigChange: (pending: boolean) => void;
  onPrintColumnsChange: (columns: (keyof PrintRow)[]) => void;
  onPrintGroupByChange: (groupBy: GroupByKey) => void;
  onDownload: () => void;
  onPrint: () => void;
};

const PRINT_STATUS_OPTIONS = ["NotStarted", "InProgress", "Paused", "Pending", "Complete", "Closed", "Issue"] as const;

const PRINT_STATUS_LABELS: Record<string, string> = {
  NotStarted: "Not Started",
  InProgress: "In Progress",
  Paused: "Paused",
  Pending: "Pending",
  Complete: "Complete",
  Closed: "Closed",
  Issue: "Issue",
  Cancelled: "Cancelled",
};

export default function AssetInstallationPrintDialog({
  open,
  generating,
  scope,
  selectedCount,
  visibleCount,
  printRows,
  printColumns,
  printGroupBy,
  printTechId,
  printModel,
  printStatuses,
  printPendingSig,
  users,
  onClose,
  onScopeChange,
  onPrintTechIdChange,
  onPrintModelChange,
  onPrintStatusesChange,
  onPrintPendingSigChange,
  onPrintColumnsChange,
  onPrintGroupByChange,
  onDownload,
  onPrint,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ className: "glass-card", sx: { bgcolor: "var(--panel)", border: "1px solid var(--stroke)" } }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <PrintOutlined fontSize="small" />
        Print / Save PDF
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <Box>
            <FormLabel component="legend" sx={{ fontWeight: 700, mb: 1, fontSize: 13 }}>Scope</FormLabel>
            <RadioGroup row value={scope} onChange={(e) => onScopeChange(e.target.value as PrintScope)}>
              <FormControlLabel
                value="selection"
                control={<Radio size="small" />}
                label={`Current selection (${selectedCount})`}
                disabled={selectedCount === 0}
              />
              <FormControlLabel value="visible" control={<Radio size="small" />} label={`All visible (${visibleCount})`} />
              <FormControlLabel value="custom" control={<Radio size="small" />} label="Custom filter" />
            </RadioGroup>
          </Box>

          {scope === "custom" && (
            <Box sx={{ pl: 2, borderLeft: "3px solid var(--stroke)" }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Custom filters</Typography>
              <Stack spacing={2}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel shrink>User</InputLabel>
                    <Select label="User" value={printTechId} onChange={(e) => onPrintTechIdChange(e.target.value)}>
                      <MenuItem value="">(All users)</MenuItem>
                      {users.filter((u) => u.isActive).map((u) => (
                        <MenuItem key={u.id} value={u.id}>{u.fullName}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    label="Asset model contains"
                    value={printModel}
                    onChange={(e) => onPrintModelChange(e.target.value)}
                    sx={{ minWidth: 200 }}
                  />
                </Stack>

                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>Statuses to include</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {PRINT_STATUS_OPTIONS.map((status) => {
                      const checked = printStatuses.includes(status);
                      return (
                        <FormControlLabel
                          key={status}
                          control={
                            <Checkbox
                              size="small"
                              checked={checked}
                              onChange={() =>
                                onPrintStatusesChange(
                                  checked ? printStatuses.filter((x) => x !== status) : [...printStatuses, status],
                                )
                              }
                            />
                          }
                          label={PRINT_STATUS_LABELS[status]}
                        />
                      );
                    })}
                  </Stack>
                </Box>

                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={printPendingSig}
                      onChange={(e) => onPrintPendingSigChange(e.target.checked)}
                    />
                  }
                  label="Pending customer signature only"
                />
              </Stack>
            </Box>
          )}

          <Box>
            <FormLabel component="legend" sx={{ fontWeight: 700, mb: 1, fontSize: 13 }}>Columns to include</FormLabel>
            <FormGroup row>
              {ALL_PRINT_COLUMNS.filter((c) => !c.id.startsWith("_")).map((col) => {
                const checked = printColumns.includes(col.id);
                const isAlways = col.id === "assetTag";
                return (
                  <FormControlLabel
                    key={col.id}
                    control={
                      <Checkbox
                        size="small"
                        checked={checked || isAlways}
                        disabled={isAlways}
                        onChange={() =>
                          onPrintColumnsChange(
                            checked ? printColumns.filter((x) => x !== col.id) : [...printColumns, col.id],
                          )
                        }
                      />
                    }
                    label={col.label}
                    sx={{ mr: 2, mb: 0.5 }}
                  />
                );
              })}
            </FormGroup>
          </Box>

          <Box>
            <FormLabel component="legend" sx={{ fontWeight: 700, mb: 1, fontSize: 13 }}>Group by</FormLabel>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={printGroupBy}
              onChange={(_, v) => { if (v) onPrintGroupByChange(v as GroupByKey); }}
            >
              <ToggleButton value="none">None</ToggleButton>
              <ToggleButton value="technician">Technician</ToggleButton>
              <ToggleButton value="status">Status</ToggleButton>
              <ToggleButton value="project">Project</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Alert severity={printRows.length === 0 ? "warning" : "info"} sx={{ py: 0.5 }}>
            {printRows.length === 0
              ? "No assets match the current filters."
              : `${printRows.length} asset${printRows.length !== 1 ? "s" : ""} will be included | ${printColumns.length} column${printColumns.length !== 1 ? "s" : ""} | grouped by ${printGroupBy}`}
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button variant="outlined" onClick={onClose}>Cancel</Button>
        <Button
          variant="outlined"
          startIcon={<FileDownloadOutlined fontSize="small" />}
          disabled={printRows.length === 0 || generating}
          onClick={onDownload}
        >
          {generating ? "Generating..." : "Download PDF"}
        </Button>
        <Button
          variant="contained"
          startIcon={<PrintOutlined fontSize="small" />}
          disabled={printRows.length === 0 || generating}
          onClick={onPrint}
        >
          {generating ? "Generating..." : "Print"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
