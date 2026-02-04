import { Chip } from "@mui/material";
import { ProjectStatus } from "../../types/project";

const statusColorMap: Record<ProjectStatus, "default" | "success" | "warning" | "info" | "error"> = {
  Draft: "info",
  "In Planning": "info",
  Approved: "success",
  "In Progress": "warning",
  Completed: "success",
  "Pending Approval": "warning",
  "On Hold": "warning",
  Cancelled: "error"
};

interface StatusChipProps {
  status: ProjectStatus;
}

const StatusChip = ({ status }: StatusChipProps) => {
  return <Chip label={status} color={statusColorMap[status]} size="small" />;
};

export default StatusChip;
