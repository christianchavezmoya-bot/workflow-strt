import { Autocomplete, FormControl, InputLabel, MenuItem, Select, TextField } from "@mui/material";
import { useMemo } from "react";
import type { Project } from "../types/project";

const AUTocomplete_THRESHOLD = 25;

function formatProjectLabel(p: Project): string {
  return p.customerName ? `${p.jobNumber} · ${p.customerName}` : p.jobNumber;
}

export interface ProjectJobSelectProps {
  projects: Project[];
  value: string;
  onChange: (projectId: string) => void;
  size?: "small" | "medium";
  sx?: object;
  /** Desktop/web uses " - " separator; mobile uses " · " */
  labelStyle?: "mobile" | "desktop";
}

/**
 * Searchable project picker for large catalogs. Falls back to MUI Select when
 * the list is small so dropdown open stays fast on typical jobs.
 */
export default function ProjectJobSelect({
  projects,
  value,
  onChange,
  size = "small",
  sx,
  labelStyle = "desktop",
}: ProjectJobSelectProps) {
  const sorted = useMemo(
    () => [...projects].sort((a, b) => a.jobNumber.localeCompare(b.jobNumber)),
    [projects],
  );

  const selected = useMemo(
    () => sorted.find((p) => p.id === value) ?? null,
    [sorted, value],
  );

  if (sorted.length >= AUTocomplete_THRESHOLD) {
    return (
      <Autocomplete
        size={size}
        options={sorted}
        value={selected}
        onChange={(_, next) => onChange(next?.id ?? "")}
        getOptionLabel={(p) => formatProjectLabel(p)}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(params) => (
          <TextField {...params} label="Project" placeholder="Search job number…" />
        )}
        sx={{ flex: 1, minWidth: 150, ...sx }}
        disablePortal
        autoHighlight
        openOnFocus
        clearText="All projects"
      />
    );
  }

  return (
    <FormControl size={size} sx={{ flex: 1, minWidth: 150, ...sx }}>
      <InputLabel shrink>Project</InputLabel>
      <Select
        label="Project"
        value={value}
        onChange={(e) => onChange(String(e.target.value))}
        MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}
      >
        <MenuItem value="">All projects</MenuItem>
        {sorted.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {labelStyle === "desktop"
              ? `${p.jobNumber} - ${p.customerName ?? ""}`
              : formatProjectLabel(p)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
