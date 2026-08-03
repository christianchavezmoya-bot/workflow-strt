import { Alert, Box, Button, Dialog, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchUsers } from "../../store/usersSlice";
import { projectAssetService } from "../../services/projectAssetService";
import { projectInspectionRunService } from "../../services/projectInspectionRunService";
import { projectService } from "../../services/projectService";
import { workflowConfigService } from "../../services/workflowConfigService";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { Project } from "../../types/project";
import type { ProjectAsset } from "../../types/projectAsset";
import type { Workflow } from "../../types/workflow";
import type { WorkflowConfig } from "../../types/workflowConfig";
import { isInspectionWorkflowConfig } from "../../utils/inspectionWorkflow";
import { markWorkflowOpenTap } from "../../utils/workflowOpenPerf";
import {
  loadWorkflowOpenPayload,
  refreshWorkflowOpenDataInBackground,
  OFFLINE_CONFIG_MISSING_MESSAGE,
  isOfflineConfigMissingContext,
  retryOfflineDownload,
} from "../../services/workflowOpenService";
import { isMobileNativePlatform } from "../../utils/platform";
import WorkflowRunHistoryDialog from "../installations/WorkflowRunHistoryDialog";
import WorkOrderRunner from "../workInstructions/WorkOrderRunner";
import ProjectInspectionInboxPage from "./ProjectInspectionInboxPage";

function isResumableInspectionRun(run: AssetWorkflowRun): boolean {
  return !run.isLocked && (run.status === "InProgress" || run.status === "Paused");
}

export default function ProjectAssetInspectionPage() {
  const { id: projectId = "", assetId = "" } = useParams();
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const users = useAppSelector((state) => state.users.items);
  const [project, setProject] = useState<Project | null>(null);
  const [asset, setAsset] = useState<ProjectAsset | null>(null);
  const [runs, setRuns] = useState<AssetWorkflowRun[]>([]);
  const [configs, setConfigs] = useState<WorkflowConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [runnerWorkflow, setRunnerWorkflow] = useState<Workflow | null>(null);
  const [runnerConfig, setRunnerConfig] = useState<WorkflowConfig | null>(null);
  const [runHistoryOpen, setRunHistoryOpen] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function load(options?: { background?: boolean }) {
    if (!projectId || !assetId) return;
    try {
      const [loadedProject, loadedAsset] = await Promise.all([
        projectService.getProject(projectId),
        projectAssetService.getById(assetId),
      ]);
      if (!loadedAsset) {
        setError("Asset not found.");
        return;
      }

      const [loadedRuns, productConfigs] = await Promise.all([
        isMobileNativePlatform()
          ? projectInspectionRunService.listLocalFirst(projectId, assetId)
          : projectInspectionRunService.list(projectId, assetId).catch(() => []),
        workflowConfigService.listByProduct(loadedAsset.productId, "Published").catch(() => []),
      ]);
      const inspectionConfigs = productConfigs.filter(isInspectionWorkflowConfig);

      setProject(loadedProject);
      setAsset(loadedAsset);
      setRuns(loadedRuns);
      setConfigs(inspectionConfigs);
      setSelectedConfigId((current) => current || inspectionConfigs[0]?.id || "");
      setError(null);

      if (isMobileNativePlatform() && !options?.background) {
        projectInspectionRunService.refreshInBackground(projectId, assetId);
        void projectInspectionRunService.list(projectId, assetId)
          .then(setRuns)
          .catch(() => {});
      }
    } catch {
      if (!options?.background) {
        setError("Unable to load inspection asset details.");
      }
    }
  }

  useEffect(() => {
    dispatch(fetchUsers());
    void load();
  }, [assetId, dispatch, projectId]);

  const selectedConfig = useMemo(
    () => configs.find((config) => config.id === selectedConfigId) ?? null,
    [configs, selectedConfigId]
  );

  async function openInspectionRunner(
    configId: string,
    options?: { runs?: AssetWorkflowRun[]; existingRunId?: string },
  ): Promise<boolean> {
    if (!assetId) return false;
    const payload = await loadWorkflowOpenPayload(configId, { id: assetId }, {
      configFromMemory: configs.find((config) => config.id === configId) ?? selectedConfig,
      runs: options?.runs ?? runs,
      workflowConfigIdForRun: configId,
      mergeMedia: true,
    });
    if (!payload) {
      if (isOfflineConfigMissingContext()) {
        setError(OFFLINE_CONFIG_MISSING_MESSAGE);
        retryOfflineDownload();
      } else {
        setError("Unable to load inspection workflow.");
      }
      return false;
    }
    setRunnerConfig(payload.config);
    setRunnerWorkflow(payload.workflow);
    setActiveRunId(options?.existingRunId ?? payload.existingRunId ?? null);
    setRunnerOpen(true);
    refreshWorkflowOpenDataInBackground(assetId, configId);
    return true;
  }

  async function handleStartInspection() {
    if (!projectId || !assetId || !selectedConfig) return;
    markWorkflowOpenTap("inspection-start", selectedConfig.id);
    setStarting(true);
    setError(null);
    try {
      const run = await projectInspectionRunService.create(projectId, assetId, {
        workflowConfigId: selectedConfig.id,
        technicianUserId: user?.id,
      });
      const nextRuns = [run, ...runs.filter((item) => item.id !== run.id)];
      setRuns(nextRuns);
      const opened = await openInspectionRunner(selectedConfig.id, {
        runs: nextRuns,
        existingRunId: run.id,
      });
      if (!opened) return;
    } catch {
      setError("Unable to start inspection.");
    } finally {
      setStarting(false);
    }
  }

  async function handleResumeInspection(run: AssetWorkflowRun) {
    markWorkflowOpenTap("inspection-resume", run.workflowConfigId);
    setError(null);
    await openInspectionRunner(run.workflowConfigId, {
      runs,
      existingRunId: run.id,
    });
  }

  const runnerTeamMembers = useMemo(() => {
    if (!project?.teamMemberIds?.length) return [];
    return users
      .filter((item) => item.isActive && project.teamMemberIds?.includes(item.id))
      .map((item) => ({ id: item.id, fullName: item.fullName }));
  }, [project?.teamMemberIds, users]);

  if (!asset) {
    return <Typography variant="body2" color="text.secondary">{error || "Loading inspection asset..."}</Typography>;
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5}>
        <Box>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
            {asset.assetTag || asset.assetName || asset.id} inspections
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {project ? (
              <>
                <Link to={`/projects/${project.id}`} style={{ color: "inherit" }}>{project.jobNumber}</Link>
                {" "}• {project.customerName}
              </>
            ) : (
              "Project details loading…"
            )}
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel id="inspection-config-select">Inspection workflow</InputLabel>
            <Select
              labelId="inspection-config-select"
              value={selectedConfigId}
              label="Inspection workflow"
              onChange={(e) => setSelectedConfigId(e.target.value)}
            >
              {configs.map((config) => (
                <MenuItem key={config.id} value={config.id}>
                  {config.displayName || config.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            onClick={() => void handleStartInspection()}
            disabled={!selectedConfig || starting}
          >
            {starting ? "Starting…" : "Create Inspection"}
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              setActiveRunId(runs[0]?.id ?? null);
              setRunHistoryOpen(true);
            }}
            disabled={runs.length === 0}
          >
            View Runs
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {configs.length === 0 && (
        <Alert severity="info">
          No published inspection workflow is available for this asset yet. You can still review the linked inspection inbox item below.
        </Alert>
      )}

      <Box className="glass-card" sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" sx={{ fontFamily: "Sora", mb: 1 }}>Inspection Runs</Typography>
        {runs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No internal inspection runs recorded yet.</Typography>
        ) : (
          <Stack spacing={1}>
            {runs.map((run) => (
              <Box key={run.id} sx={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 2, p: 1.5 }}>
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1}>
                  <Box>
                    <Typography variant="body2" fontWeight={700}>
                      Run #{run.runNumber} • {run.status}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Started {new Date(run.startedAt).toLocaleString()}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    {isResumableInspectionRun(run) && (
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => void handleResumeInspection(run)}
                      >
                        Resume
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setActiveRunId(run.id);
                        setRunHistoryOpen(true);
                      }}
                    >
                      Open popup
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <ProjectInspectionInboxPage
        projectId={project?.id ?? projectId}
        assetId={asset.id}
        assets={[asset]}
        onChanged={() => load({ background: true })}
      />

      {runnerConfig && runnerWorkflow && (
        <Dialog open={runnerOpen} onClose={() => setRunnerOpen(false)} maxWidth="lg" fullWidth>
          <DialogTitle>Inspection runner</DialogTitle>
          <DialogContent>
            <WorkOrderRunner
              open={runnerOpen}
              onClose={() => {
                setRunnerOpen(false);
                void load({ background: true });
              }}
              workflow={runnerWorkflow}
              productId={asset.productId}
              productName={project?.jobNumber ?? asset.assetTag ?? "Inspection"}
              projectAssetId={asset.id}
              workflowConfigId={runnerConfig.id}
              existingRunId={activeRunId ?? undefined}
              currentUserName={user.fullName}
              assetTag={asset.assetTag}
              jobNumber={project?.jobNumber}
              timeZoneId={project?.timeZoneId}
              teamMembers={runnerTeamMembers}
            />
          </DialogContent>
        </Dialog>
      )}

      <WorkflowRunHistoryDialog
        open={runHistoryOpen}
        onClose={() => setRunHistoryOpen(false)}
        asset={asset}
        workflowConfigId=""
        workflowConfigName="Inspection Runs"
        currentUserName={user.fullName}
        onRerun={() => {}}
      />
    </Stack>
  );
}
