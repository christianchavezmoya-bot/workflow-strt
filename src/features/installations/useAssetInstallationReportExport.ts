import { useCallback, useState } from "react";
import { useAppToast } from "../../contexts/AppToastContext";
import type { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import type { brandSettingsService } from "../../services/brandSettingsService";
import type { customerService } from "../../services/customerService";
import type { featureService } from "../../services/featureService";
import type { mediaStore } from "../../services/mediaStore";
import type { signatureService } from "../../services/signatureService";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { runHasCaptureBlobs } from "../../types/assetWorkflowRunSummary";
import type { Feature as LibFeature } from "../../types/feature";
import type { Project } from "../../types/project";
import type { ProjectAsset } from "../../types/projectAsset";
import type { User } from "../../types/user";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { pickCaptureRun } from "../../utils/captureSpreadsheet";
import type { resolveProjectTimeZoneForReport } from "../../utils/projectTimeZone";
import type { isMobileNativePlatform } from "../../utils/platform";
import { downloadBlob } from "../../utils/bulkWorkflowReportDownload";
import type { WorkflowReportExportContext } from "../../utils/workflowReportExport";

export type AssetReportExportServices = {
  assetWorkflowRunService: typeof assetWorkflowRunService;
  customerService: typeof customerService;
  brandSettingsService: typeof brandSettingsService;
  featureService: typeof featureService;
  signatureService: typeof signatureService;
  mediaStore: typeof mediaStore;
  isMobileNativePlatform: typeof isMobileNativePlatform;
  pickCaptureRun: typeof pickCaptureRun;
  runHasCaptureBlobs: typeof runHasCaptureBlobs;
  resolveProjectTimeZoneForReport: typeof resolveProjectTimeZoneForReport;
};

export type BuildAssetReportContextParams = {
  runsMap: Record<string, AssetWorkflowRun[]>;
  wfConfigMap: ReadonlyMap<string, WorkflowConfig>;
  users: User[];
  projects: Project[];
  asset: ProjectAsset;
} & AssetReportExportServices;

export function useAssetInstallationReportExport() {
  const toast = useAppToast();
  const [reportGenerating, setReportGenerating] = useState<string | null>(null);
  const [reportExportOpen, setReportExportOpen] = useState(false);
  const [reportExportAsset, setReportExportAsset] = useState<ProjectAsset | null>(null);
  const [reportPreviewBlob, setReportPreviewBlob] = useState<Blob | null>(null);
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false);
  const [reportPreviewError, setReportPreviewError] = useState<string | null>(null);
  const [reportPreviewContext, setReportPreviewContext] = useState<WorkflowReportExportContext | null>(null);
  const [reportPreviewFileBase, setReportPreviewFileBase] = useState<string | null>(null);

  const buildAssetReportContext = useCallback(
    async ({
      runsMap,
      wfConfigMap,
      users,
      projects,
      asset,
      assetWorkflowRunService: runService,
      customerService: customers,
      brandSettingsService: brandSettingsSvc,
      featureService: features,
      signatureService: signatures,
      mediaStore: media,
      isMobileNativePlatform: isNative,
      pickCaptureRun: pickRun,
      runHasCaptureBlobs: hasCaptureBlobs,
      resolveProjectTimeZoneForReport: resolveTimeZone,
    }: BuildAssetReportContextParams): Promise<WorkflowReportExportContext> => {
      let runs = runsMap[asset.id];
      if (!runs) {
        try { runs = await runService.listByAsset(asset.id); } catch { runs = []; }
      }

      let run = pickRun(runs ?? []);

      // Web perf loads slim run summaries (empty stepResultsJson). Hydrate before report export.
      if (run && !hasCaptureBlobs(run)) {
        try {
          const full = await runService.getById(run.id);
          if (full && hasCaptureBlobs(full)) {
            run = full;
          } else {
            const loaded = await runService.loadRunDetailsForAssets(asset.projectId, [asset.id]);
            const hydrated = pickRun(loaded.filter((r) => r.assetId === asset.id));
            if (hydrated && hasCaptureBlobs(hydrated)) run = hydrated;
          }
        } catch {
          /* keep best available run */
        }
      }

      const effectiveRun: AssetWorkflowRun = run ?? {
        id: "", assetId: asset.id,
        workflowConfigId: asset.productConfigId ?? "",
        workflowVersion: 1, workflowSnapshotJson: "{}",
        status: "InProgress", isLocked: false,
        stepResultsJson: "[]", issuesJson: "[]", timeTrackingJson: "[]",
        productiveSeconds: 0, downtimeSeconds: 0, downtimeEvents: 0,
        runNumber: 1, startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        signatureStatus: "None",
      };

      const configId = effectiveRun.workflowConfigId || asset.productConfigId;
      const wfCfg = configId ? wfConfigMap.get(configId) : null;
      const configName = wfCfg?.displayName ?? wfCfg?.name ?? "Installation Record";
      const cfgType = (wfCfg?.configType ?? "").trim().toLowerCase();
      const docType = cfgType === "inspection" || cfgType === "wftype-inspection" ? "inspection" as const : "installation" as const;
      const tech = users.find((u) => u.id === asset.assignedUserId);
      const proj = projects.find((p) => p.id === asset.projectId);

      let rawCustomerLogo: string | null = null;
      if (proj?.customerId) {
        try {
          const allCustomers = await customers.getCustomers();
          rawCustomerLogo = allCustomers.find((c) => c.customerId === proj.customerId || c.id === proj.customerId)?.logo ?? null;
        } catch { /* ignore */ }
      }

      const [brandSettings, signatureEvents, productFeatures] = await Promise.all([
        brandSettingsSvc.get(),
        effectiveRun.isLocked && effectiveRun.id
          ? signatures.listEvents(effectiveRun.id).catch(() => [])
          : Promise.resolve([]),
        asset.productId
          ? features.getByProduct(asset.productId).catch(() => [] as LibFeature[])
          : Promise.resolve([] as LibFeature[]),
      ]);
      const [bizLogoResolved, custLogoResolved] = await Promise.all([
        brandSettings.logoBase64
          ? import("../../utils/generateWorkflowReport").then(({ resolveImageToDataUrl }) => resolveImageToDataUrl(brandSettings.logoBase64!))
          : Promise.resolve(null),
        rawCustomerLogo
          ? import("../../utils/generateWorkflowReport").then(({ resolveImageToDataUrl }) => resolveImageToDataUrl(rawCustomerLogo))
          : Promise.resolve(null),
      ]);

      const reportRun = isNative()
        ? await media.resolveUploadPayload(effectiveRun)
        : effectiveRun;

      return {
        run: reportRun,
        asset,
        workflowConfigName: configName,
        businessLogoBase64: bizLogoResolved,
        customerLogoBase64: custLogoResolved,
        customerName: proj?.customerName,
        jobNumber: proj?.jobNumber,
        siteName: proj?.siteName,
        siteLocation: asset.location ?? undefined,
        assignedTechnician: tech?.fullName,
        documentType: docType,
        timeZoneId: await resolveTimeZone(proj),
        signatureEvents,
        productFeatures,
      };
    },
    [],
  );

  const closeReportExportDialog = useCallback(() => {
    setReportExportOpen(false);
    setReportExportAsset(null);
    setReportPreviewContext(null);
    setReportPreviewFileBase(null);
    setReportPreviewError(null);
    setReportPreviewLoading(false);
    setReportPreviewBlob(null);
  }, []);

  const openReportExportDialog = useCallback(
    async (asset: ProjectAsset, contextParams: BuildAssetReportContextParams) => {
      setReportExportAsset(asset);
      setReportPreviewContext(null);
      setReportPreviewFileBase(null);
      setReportPreviewError(null);
      setReportPreviewLoading(true);
      setReportPreviewBlob(null);
      setReportExportOpen(true);
      try {
        const reportContext = await buildAssetReportContext(contextParams);
        const { generateWorkflowReport } = await import("../../utils/generateWorkflowReport");
        const { workflowReportBaseFileName } = await import("../../utils/workflowReportExport");
        const fileBase = workflowReportBaseFileName(reportContext.asset, reportContext.run);
        const pdfBlob = await generateWorkflowReport({
          ...reportContext,
          outputMode: "blob",
        });
        if (!(pdfBlob instanceof Blob)) {
          throw new Error("Failed to build PDF preview.");
        }
        setReportPreviewContext(reportContext);
        setReportPreviewFileBase(fileBase);
        setReportPreviewBlob(pdfBlob);
      } catch (err) {
        console.error("[useAssetInstallationReportExport] Report preview failed", err);
        setReportPreviewError("Failed to load PDF preview.");
      } finally {
        setReportPreviewLoading(false);
      }
    },
    [buildAssetReportContext],
  );

  const handleAssetReportExport = useCallback(
    async (
      format: "pdf" | "json" | "docx",
      contextParams: BuildAssetReportContextParams,
    ) => {
      const asset = reportExportAsset;
      if (!asset) return;
      setReportGenerating(asset.id);
      try {
        const reportContext = reportPreviewContext ?? await buildAssetReportContext(contextParams);
        const { generateWorkflowReport } = await import("../../utils/generateWorkflowReport");
        const {
          buildWorkflowReportJson,
          createWorkflowReportDocx,
          workflowReportBaseFileName,
        } = await import("../../utils/workflowReportExport");
        const fileBase = reportPreviewFileBase ?? workflowReportBaseFileName(reportContext.asset, reportContext.run);

        if (format === "pdf") {
          await generateWorkflowReport({
            ...reportContext,
            outputMode: "download",
          });
          return;
        }

        if (format === "json") {
          const rawJson = JSON.stringify(buildWorkflowReportJson(reportContext), null, 2);
          downloadBlob(new Blob([rawJson], { type: "application/json" }), `${fileBase}.json`);
          return;
        }

        const docxBlob = await createWorkflowReportDocx(reportContext);
        downloadBlob(docxBlob, `${fileBase}.docx`);
      } catch (err) {
        console.error("[useAssetInstallationReportExport] Report export failed", err);
        toast.error("Failed to export report.");
      } finally {
        setReportGenerating(null);
      }
    },
    [buildAssetReportContext, reportExportAsset, reportPreviewContext, reportPreviewFileBase, toast],
  );

  return {
    reportGenerating,
    reportExportOpen,
    reportExportAsset,
    reportPreviewBlob,
    reportPreviewLoading,
    reportPreviewError,
    reportPreviewContext,
    reportPreviewFileBase,
    openReportExportDialog,
    closeReportExportDialog,
    handleAssetReportExport,
    buildAssetReportContext,
  };
}
