import { useCallback, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, IconButton, LinearProgress,
  Stack, Tooltip, Typography,
} from "@mui/material";
import {
  ArrowBackOutlined, EditOutlined, LockOutlined, OpenInNewOutlined, RefreshOutlined,
} from "@mui/icons-material";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppSelector } from "../../store/hooks";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import ProjectJobSelect from "../../components/ProjectJobSelect";
import CaptureSpreadsheetDialog, { type CaptureSpreadsheetAssetJobColumn } from "./CaptureSpreadsheetDialog";
import RunAmendDialog from "./RunAmendDialog";
import { useProjectCaptureData } from "./useProjectCaptureData";
import { pickCaptureRun } from "../../utils/captureSpreadsheet";
import { canEditRun } from "../../utils/runEditPermissions";
import { resolveProjectScopeId } from "../../utils/resolveProjectScopeId";
import { buildStandaloneCaptureJobColumns } from "../../utils/captureAssetJobColumns";
import type { ProjectAsset } from "../../types/projectAsset";

const PROJECT_PARAM = "project";

/**
 * Standalone read-only capture matrix for one project.
 *
 * Split out of AssetInstallationPage so the broad "what has this job captured" view does not
 * boot the operations table, its filters, dialogs and bulk actions — and so it has a URL that
 * can be bookmarked or opened in its own tab. The only mutation path is the Edit column, which
 * opens the run amend dialog.
 */
export default function CaptureTablePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const can = usePermissions();
  const projects = useAppSelector((s) => s.projects.items);
  const users = useAppSelector((s) => s.users.items);

  const rawProjectId = searchParams.get(PROJECT_PARAM) ?? "";
  const projectId = useMemo(
    () => (projects.length > 0 ? resolveProjectScopeId(projects, rawProjectId) : rawProjectId),
    [projects, rawProjectId],
  );
  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projectId, projects],
  );
  const productId = project?.productIds?.[0];

  const {
    assets, runsMap, assignmentsMap, features, depsByFeature, featureSelectionsByConfig,
    maxUnitsByFeature, activeCountForAsset, loading, runsLoading, error, applyRunUpdate, reload,
  } = useProjectCaptureData(projectId, productId);

  const [amendAsset, setAmendAsset] = useState<ProjectAsset | null>(null);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const assetJobColumns = useMemo<CaptureSpreadsheetAssetJobColumn[]>(() =>
    buildStandaloneCaptureJobColumns({ projectMap, userMap, assignmentsMap, runsMap }),
  [assignmentsMap, projectMap, runsMap, userMap]);

  const handleProjectChange = useCallback((nextId: string) => {
    const next = new URLSearchParams(searchParams);
    if (nextId) next.set(PROJECT_PARAM, nextId);
    else next.delete(PROJECT_PARAM);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const renderEditAction = useCallback((asset: ProjectAsset) => {
    const run = pickCaptureRun(runsMap[asset.id] ?? []);
    if (!run) {
      return <Typography variant="caption" color="text.disabled">No run</Typography>;
    }

    const perms = canEditRun(run, user.role);
    const amendedLabel = run.lastAmendedByName
      ? `${run.lastAmendedByRole ?? "Edited"} — ${run.lastAmendedByName}`
      : null;

    if (perms.finalized) {
      return (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title="Customer-signed. Start a new workflow run to change captured data.">
            <Chip
              size="small"
              icon={<LockOutlined sx={{ fontSize: 13 }} />}
              label="Locked"
              variant="outlined"
              sx={{ height: 20, fontSize: "0.62rem" }}
            />
          </Tooltip>
          {amendedLabel && (
            <Tooltip title={`Last edited by ${amendedLabel}`}>
              <Chip size="small" label={`${run.amendmentCount ?? 0}`} variant="outlined"
                sx={{ height: 20, fontSize: "0.62rem" }} />
            </Tooltip>
          )}
        </Stack>
      );
    }

    return (
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Tooltip title={perms.data || perms.time ? "Amend this run" : "Your role cannot amend this run"}>
          <span>
            <IconButton
              size="small"
              disabled={!perms.data && !perms.time}
              onClick={() => setAmendAsset(asset)}
            >
              <EditOutlined sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
        {amendedLabel && (
          <Tooltip title={`Last edited by ${amendedLabel}`}>
            <Chip size="small" label={amendedLabel} variant="outlined"
              sx={{ height: 20, fontSize: "0.6rem", maxWidth: 170 }} />
          </Tooltip>
        )}
      </Stack>
    );
  }, [runsMap, user.role]);

  if (!can.installationAssets?.viewCapture) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">You do not have permission to view the capture table.</Alert>
      </Box>
    );
  }

  const exportFilenameBase = project
    ? `capture-${project.jobNumber}-${new Date().toISOString().slice(0, 10)}`
    : `capture-export-${new Date().toISOString().slice(0, 10)}`;

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Tooltip title="Back to assets">
          <IconButton size="small" onClick={() => navigate("/installations/assets")}>
            <ArrowBackOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontFamily: "Sora", lineHeight: 1.2 }}>Capture table</Typography>
          <Typography variant="caption" color="text.secondary">
            Read-only view of everything captured on this job. Use Edit to amend a run.
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <ProjectJobSelect
          projects={projects}
          value={projectId}
          onChange={handleProjectChange}
          labelStyle="desktop"
          sx={{ minWidth: 220, maxWidth: 320 }}
        />
        <Tooltip title="Reload">
          <span>
            <IconButton size="small" onClick={reload} disabled={loading}>
              <RefreshOutlined fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Button
          size="small"
          variant="outlined"
          endIcon={<OpenInNewOutlined sx={{ fontSize: 14 }} />}
          onClick={() => navigate(`/installations/assets?project=${encodeURIComponent(projectId)}`)}
          disabled={!projectId}
        >
          Open assets
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" action={<Button size="small" color="inherit" onClick={reload}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {!projectId ? (
        <Alert severity="info">Select a project to view its capture table.</Alert>
      ) : loading ? (
        <Stack alignItems="center" sx={{ p: 6 }}><CircularProgress size={32} /></Stack>
      ) : assets.length === 0 ? (
        <Alert severity="info">No assets on this job yet.</Alert>
      ) : (
        <>
          {runsLoading && <LinearProgress />}
          <CaptureSpreadsheetDialog
            embedded
            open
            onClose={() => navigate("/installations/assets")}
            hideSelectionColumn
            assets={assets}
            runsMap={runsMap}
            captureRunsLoading={runsLoading}
            schemaFallback
            maxUnitsByFeature={maxUnitsByFeature}
            features={features}
            depsByFeature={depsByFeature}
            featureSelectionsByConfig={featureSelectionsByConfig}
            activeCountForAsset={activeCountForAsset}
            readOnly
            canEditCapture={false}
            userRole={user.role}
            currentUserName={user.fullName ?? user.email ?? ""}
            onRunUpdated={applyRunUpdate}
            assetJobColumns={assetJobColumns}
            renderActions={renderEditAction}
            exportEnabled
            exportFilenameBase={exportFilenameBase}
            exportProjectLabel={project ? `${project.jobNumber} — ${project.customerName}` : undefined}
          />
        </>
      )}

      {amendAsset && (
        <RunAmendDialog
          open
          asset={amendAsset}
          run={pickCaptureRun(runsMap[amendAsset.id] ?? []) ?? null}
          projectId={projectId}
          onClose={() => setAmendAsset(null)}
          onRunUpdated={applyRunUpdate}
        />
      )}
    </Stack>
  );
}
