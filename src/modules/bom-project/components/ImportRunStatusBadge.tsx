import { Chip } from "@mui/material";
import type { ImportRunStatus } from "../types/importRun";

const STATUS_CONFIG: Record<ImportRunStatus, { label: string; color: "default" | "primary" | "warning" | "success" | "error" | "info" }> = {
  uploading:    { label: "Uploading",    color: "info" },
  parsing:      { label: "Parsing",      color: "info" },
  mapping:      { label: "Mapping",      color: "primary" },
  classifying:  { label: "Classifying",  color: "primary" },
  validating:   { label: "Validating",   color: "warning" },
  ready:        { label: "Ready",        color: "success" },
  committing:   { label: "Committing",   color: "warning" },
  published:    { label: "Published",    color: "success" },
  failed:       { label: "Failed",       color: "error" },
  archived:     { label: "Archived",     color: "default" },
};

export default function ImportRunStatusBadge({ status }: { status: ImportRunStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "default" };
  return <Chip label={cfg.label} color={cfg.color} size="small" />;
}
