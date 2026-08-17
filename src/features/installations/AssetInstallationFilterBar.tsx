import { CloseOutlined, GridOnOutlined, SearchOutlined } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import type { MouseEvent } from "react";
import ProjectJobSelect from "../../components/ProjectJobSelect";
import type { Project } from "../../types/project";
import type { ProjectAssetStatus } from "../../types/projectAsset";

type Props = {
  isNativePlatform: boolean;
  projects: Project[];
  selectedProjectId: string;
  allProjectsExplicit: boolean;
  search: string;
  statusFilter: ProjectAssetStatus | "All";
  showNoWorkflow: boolean;
  mobileScope: "mine" | "all";
  canViewCaptureMatrix: boolean;
  onProjectChange: (projectId: string) => void;
  onSearchChange: (search: string) => void;
  onOpenAssetSearch: () => void;
  onStatusFilterChange: (status: ProjectAssetStatus | "All") => void;
  onShowNoWorkflowChange: (show: boolean) => void;
  onMobileScopeChange: (scope: "mine" | "all") => void;
  onOpenCaptureTable: () => void;
  onNavigateCaptureTable: (projectId: string) => void;
};

const MOBILE_STATUS_CHIPS = [
  { value: "All", label: "All", color: "default" },
  { value: "NotStarted", label: "Not Started", color: "default" },
  { value: "InProgress", label: "In Progress", color: "primary" },
  { value: "Paused", label: "Paused", color: "warning" },
  { value: "Pending", label: "Pending", color: "default" },
  { value: "Complete", label: "Complete", color: "success" },
  { value: "Closed", label: "Closed", color: "info" },
  { value: "Issue", label: "Issue", color: "error" },
] as const;

export default function AssetInstallationFilterBar({
  isNativePlatform,
  projects,
  selectedProjectId,
  allProjectsExplicit,
  search,
  statusFilter,
  showNoWorkflow,
  mobileScope,
  canViewCaptureMatrix,
  onProjectChange,
  onSearchChange,
  onOpenAssetSearch,
  onStatusFilterChange,
  onShowNoWorkflowChange,
  onMobileScopeChange,
  onOpenCaptureTable,
  onNavigateCaptureTable,
}: Props) {
  if (isNativePlatform) {
    return (
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="center">
          <ProjectJobSelect
            projects={projects}
            value={selectedProjectId}
            onChange={onProjectChange}
            labelStyle="mobile"
            sx={{ flex: 1 }}
          />
          <IconButton
            size="small"
            onClick={onOpenAssetSearch}
            sx={{
              border: "1px solid",
              borderColor: search ? "primary.main" : "divider",
              borderRadius: 1,
              color: search ? "primary.main" : "text.secondary",
              p: 0.75,
              flexShrink: 0,
            }}
          >
            <SearchOutlined sx={{ fontSize: 20 }} />
          </IconButton>
          {search.trim() && (
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<CloseOutlined sx={{ fontSize: 16 }} />}
              onClick={() => onSearchChange("")}
              sx={{ flexShrink: 0, fontSize: 11, whiteSpace: "nowrap", height: 34 }}
            >
              Clear search
            </Button>
          )}
          {canViewCaptureMatrix && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<GridOnOutlined sx={{ fontSize: 16 }} />}
              onClick={onOpenCaptureTable}
              sx={{ flexShrink: 0, fontSize: 11, whiteSpace: "nowrap" }}
            >
              Table view
            </Button>
          )}
        </Stack>
        {search.trim() && (
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label={`Filter: ${search}`}
            onDelete={() => onSearchChange("")}
            sx={{ alignSelf: "flex-start", maxWidth: "100%" }}
          />
        )}
        <ToggleButtonGroup
          value={mobileScope}
          exclusive
          size="small"
          onChange={(_, v) => { if (v) onMobileScopeChange(v as "mine" | "all"); }}
          sx={{ alignSelf: "flex-start" }}
        >
          <ToggleButton value="mine" sx={{ fontSize: 11, py: 0.4, px: 1.25 }}>My Assets</ToggleButton>
          <ToggleButton value="all" sx={{ fontSize: 11, py: 0.4, px: 1.25 }}>All Assets</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ overflowX: "auto", pb: 0.25, mx: -0.25 }}>
          <Stack direction="row" spacing={0.6} sx={{ width: "max-content", px: 0.25 }}>
            {MOBILE_STATUS_CHIPS.map(({ value, label, color }) => (
              <Chip
                key={value}
                label={label}
                size="small"
                color={statusFilter === value ? (color as "default" | "primary" | "success" | "error" | "warning" | "info") : "default"}
                variant={statusFilter === value ? "filled" : "outlined"}
                clickable
                onClick={() => {
                  onStatusFilterChange(value as ProjectAssetStatus | "All");
                  onShowNoWorkflowChange(false);
                }}
                sx={{ fontSize: 11, height: 26 }}
              />
            ))}
            <Chip
              label="No Workflow"
              size="small"
              color={showNoWorkflow ? "warning" : "default"}
              variant={showNoWorkflow ? "filled" : "outlined"}
              clickable
              onClick={() => {
                onShowNoWorkflowChange(!showNoWorkflow);
                if (!showNoWorkflow) onStatusFilterChange("All");
              }}
              sx={{ fontSize: 11, height: 26 }}
            />
          </Stack>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
      <ProjectJobSelect
        projects={projects}
        value={selectedProjectId}
        onChange={onProjectChange}
        labelStyle="desktop"
      />
      <Button
        size="small"
        variant={allProjectsExplicit ? "contained" : "outlined"}
        onClick={() => onProjectChange("")}
        sx={{ whiteSpace: "nowrap", height: 40 }}
      >
        All projects
      </Button>
      <Tooltip title={statusFilter !== "All" ? "Reset status filter to use this" : ""}>
        <span>
          <Button
            size="small"
            variant={showNoWorkflow ? "contained" : "outlined"}
            color={showNoWorkflow ? "warning" : "inherit"}
            disabled={statusFilter !== "All"}
            onClick={() => onShowNoWorkflowChange(!showNoWorkflow)}
            sx={{ whiteSpace: "nowrap", height: 40 }}
          >
            No Workflow
          </Button>
        </span>
      </Tooltip>
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel shrink>Status</InputLabel>
        <Select
          label="Status"
          value={statusFilter}
          disabled={showNoWorkflow}
          onChange={(e) => onStatusFilterChange(e.target.value as ProjectAssetStatus | "All")}
        >
          <MenuItem value="All">All statuses</MenuItem>
          <MenuItem value="NotStarted">Not Started</MenuItem>
          <MenuItem value="InProgress">In Progress</MenuItem>
          <MenuItem value="Paused">Paused</MenuItem>
          <MenuItem value="Pending">Pending</MenuItem>
          <MenuItem value="Complete">Complete</MenuItem>
          <MenuItem value="Closed">Closed</MenuItem>
          <MenuItem value="Issue">Issue</MenuItem>
          <MenuItem value="Cancelled">Cancelled</MenuItem>
        </Select>
      </FormControl>
      <Tooltip title="Search by asset tag, serial, part #, captures, or installer">
        <IconButton
          size="small"
          onClick={onOpenAssetSearch}
          sx={{
            border: "1px solid",
            borderColor: search ? "primary.main" : "divider",
            borderRadius: 1,
            color: search ? "primary.main" : "text.secondary",
            p: 0.75,
          }}
        >
          <SearchOutlined sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
      {search.trim() && (
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          startIcon={<CloseOutlined sx={{ fontSize: 16 }} />}
          onClick={() => onSearchChange("")}
          sx={{ whiteSpace: "nowrap", height: 40 }}
        >
          Clear search
        </Button>
      )}
      {canViewCaptureMatrix && selectedProjectId && (
        <Tooltip title="Open the full-job capture table. Ctrl/Cmd-click for a new tab.">
          <Button
            size="small"
            variant="outlined"
            component="a"
            href={`/installations/capture?project=${encodeURIComponent(selectedProjectId)}`}
            onClick={(e: MouseEvent<HTMLAnchorElement>) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onNavigateCaptureTable(selectedProjectId);
            }}
            sx={{ fontSize: 11, py: 0.5, px: 1.25, whiteSpace: "nowrap" }}
          >
            Capture table
          </Button>
        </Tooltip>
      )}
    </Stack>
  );
}
