import { useCallback, useMemo, useState } from "react";
import { brandSettingsService } from "../../services/brandSettingsService";
import type { GroupByKey, PrintRow } from "../../utils/assetListReportColumns";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowAssignment } from "../../types/workflowType";

type PrintScope = "selection" | "visible" | "custom";

type Params = {
  assets: ProjectAsset[];
  visibleAssets: ProjectAsset[];
  selectedAssetIds: Set<string>;
  userMap: ReadonlyMap<string, { fullName: string }>;
  projectMap: ReadonlyMap<string, { jobNumber: string; customerName: string; siteName?: string }>;
  runsMap: Record<string, AssetWorkflowRun[]>;
  assignmentsMap: Record<string, WorkflowAssignment[]>;
  activeProductName?: string;
};

const DEFAULT_PRINT_COLUMNS: (keyof PrintRow)[] = [
  "assetTag", "assetName", "serialNumber", "assetModel", "location",
  "assignedTech", "status", "project", "sigStatus",
];

export function useAssetInstallationPrint({
  assets,
  visibleAssets,
  selectedAssetIds,
  userMap,
  projectMap,
  runsMap,
  assignmentsMap,
  activeProductName,
}: Params) {
  const [printOpen, setPrintOpen] = useState(false);
  const [printScope, setPrintScope] = useState<PrintScope>("visible");
  const [printTechId, setPrintTechId] = useState("");
  const [printModel, setPrintModel] = useState("");
  const [printStatuses, setPrintStatuses] = useState<string[]>([
    "NotStarted", "InProgress", "Paused", "Pending", "Complete", "Closed", "Issue",
  ]);
  const [printPendingSig, setPrintPendingSig] = useState(false);
  const [printColumns, setPrintColumns] = useState<(keyof PrintRow)[]>(DEFAULT_PRINT_COLUMNS);
  const [printGroupBy, setPrintGroupBy] = useState<GroupByKey>("none");
  const [printGenerating, setPrintGenerating] = useState(false);

  const printRows = useMemo((): PrintRow[] => {
    let pool = assets;
    if (printScope === "selection") {
      pool = assets.filter((a) => selectedAssetIds.has(a.id));
    } else if (printScope === "visible") {
      pool = visibleAssets;
    } else {
      pool = assets.filter((a) => {
        if (printTechId && a.assignedUserId !== printTechId) return false;
        if (printModel && !(a.assetModel ?? "").toLowerCase().includes(printModel.toLowerCase())) return false;
        if (!printStatuses.includes(a.status)) return false;
        if (printPendingSig) {
          const runs = runsMap[a.id] ?? [];
          if (!runs[0] || (runs[0].signatureStatus !== "PendingCustomer" && runs[0].signatureStatus !== "PendingInstaller")) return false;
        }
        return true;
      });
    }
    const statusLabel: Record<string, string> = {
      NotStarted: "Not Started", InProgress: "In Progress", Paused: "Paused", Pending: "Pending",
      Complete: "Complete", Closed: "Closed", Issue: "Issue", Cancelled: "Cancelled",
    };
    return pool.map((a): PrintRow => {
      const tech = a.assignedUserId ? userMap.get(a.assignedUserId) : undefined;
      const proj = projectMap.get(a.projectId);
      const runs = runsMap[a.id] ?? [];
      const latestRun = runs[0];
      const assignments = assignmentsMap[a.id] ?? [];
      let wfStatus = "-";
      if (assignments.length > 0) {
        const names = assignments.map((x) => x.workflowTypeName || "Workflow").join(", ");
        wfStatus = latestRun
          ? `${latestRun.status === "Complete" ? "Done" : "In Progress"} (${names})`
          : `Assigned (${names})`;
      }
      let sigStatus = "-";
      if (latestRun) {
        const ss = latestRun.signatureStatus ?? "";
        if (ss === "PendingCustomer") sigStatus = "Pending Customer";
        else if (ss === "PendingInstaller") sigStatus = "Pending Installer";
        else if (ss === "Signed") sigStatus = "Signed";
        else if (ss === "WaivedCustomer") sigStatus = "Waived";
        else if (ss === "Declined") sigStatus = "Declined";
      }
      return {
        assetTag: a.assetTag ?? "",
        assetName: a.assetName ?? "",
        serialNumber: a.serialNumber ?? "",
        assetModel: a.assetModel ?? "",
        manufacturer: a.manufacturer ?? "",
        location: a.location ?? "",
        assignedTech: tech?.fullName ?? "",
        status: statusLabel[a.status] ?? a.status,
        project: proj ? `${proj.jobNumber} - ${proj.customerName}` : "",
        siteName: proj?.siteName ?? "",
        notes: a.notes ?? "",
        configType: a.configLabel ?? "",
        wfStatus,
        sigStatus,
        _techId: a.assignedUserId ?? "",
        _statusRaw: a.status,
        _projectId: a.projectId ?? "",
      };
    });
  }, [
    assets,
    assignmentsMap,
    printModel,
    printPendingSig,
    printScope,
    printStatuses,
    printTechId,
    projectMap,
    runsMap,
    selectedAssetIds,
    userMap,
    visibleAssets,
  ]);

  const buildPrintReportMeta = useCallback(async () => {
    const logoBase64 = await brandSettingsService.get().then((s) => s?.logoBase64 ?? null).catch(() => null);
    return {
      productName: activeProductName ?? "",
      filterSummary: printScope === "selection"
        ? `${printRows.length} selected assets`
        : printScope === "custom"
          ? [printTechId ? `Tech: ${userMap.get(printTechId)?.fullName}` : "", printModel ? `Model: ${printModel}` : "", printPendingSig ? "Pending Sig" : ""].filter(Boolean).join(" | ")
          : "All visible assets",
      exportDate: new Date().toLocaleDateString(),
      logoBase64,
    };
  }, [activeProductName, printModel, printPendingSig, printRows.length, printScope, printTechId, userMap]);

  const handlePrintDownload = useCallback(async () => {
    setPrintGenerating(true);
    try {
      const { generateAssetListReport } = await import("../../utils/generateAssetListReport");
      await generateAssetListReport({
        rows: printRows,
        columns: printColumns.includes("assetTag") ? printColumns : ["assetTag", ...printColumns],
        groupBy: printGroupBy,
        meta: await buildPrintReportMeta(),
        mode: "download",
        filename: `assets-${activeProductName ?? "report"}-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } finally {
      setPrintGenerating(false);
    }
  }, [activeProductName, buildPrintReportMeta, printColumns, printGroupBy, printRows]);

  const handlePrintAction = useCallback(async () => {
    setPrintGenerating(true);
    try {
      const { generateAssetListReport } = await import("../../utils/generateAssetListReport");
      await generateAssetListReport({
        rows: printRows,
        columns: printColumns.includes("assetTag") ? printColumns : ["assetTag", ...printColumns],
        groupBy: printGroupBy,
        meta: await buildPrintReportMeta(),
        mode: "print",
      });
    } finally {
      setPrintGenerating(false);
    }
  }, [buildPrintReportMeta, printColumns, printGroupBy, printRows]);

  return {
    printOpen,
    setPrintOpen,
    printScope,
    setPrintScope,
    printTechId,
    setPrintTechId,
    printModel,
    setPrintModel,
    printStatuses,
    setPrintStatuses,
    printPendingSig,
    setPrintPendingSig,
    printColumns,
    setPrintColumns,
    printGroupBy,
    setPrintGroupBy,
    printGenerating,
    printRows,
    handlePrintDownload,
    handlePrintAction,
  };
}
