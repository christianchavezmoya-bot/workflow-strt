import { useCallback, useState } from "react";
import { downloadBlob } from "../../utils/bulkWorkflowReportDownload";
import { openPrintWindow } from "../../utils/printWindow";
import {
  buildAssetExportHtml,
  buildAssetExportPackage,
  buildAssetExportWorkbook,
  type AssetExportColumnOption,
  type AssetExportPackageParams,
} from "./assetInstallationDataExport";

export type AssetExportDatasetParams = Omit<
  AssetExportPackageParams,
  "selectedColumnIds" | "includeBusinessLogo" | "includeCustomerLogo" | "includeProjectMeta"
>;

export function useAssetInstallationAssetExport() {
  const [assetExportDialogOpen, setAssetExportDialogOpen] = useState(false);
  const [assetExportFormat, setAssetExportFormat] = useState<"pdf" | "json" | "excel">("pdf");
  const [assetExportSelectedColumnIds, setAssetExportSelectedColumnIds] = useState<string[]>([]);
  const [assetExportIncludeProjectMeta, setAssetExportIncludeProjectMeta] = useState(true);
  const [assetExportIncludeBusinessLogo, setAssetExportIncludeBusinessLogo] = useState(true);
  const [assetExportIncludeCustomerLogo, setAssetExportIncludeCustomerLogo] = useState(true);
  const [assetExportRunning, setAssetExportRunning] = useState(false);

  const openAssetExportDialog = useCallback(
    (columnOptions: AssetExportColumnOption[], singleProjectHasCustomer: boolean) => {
      setAssetExportFormat("pdf");
      setAssetExportSelectedColumnIds(columnOptions.map((column) => column.id));
      setAssetExportIncludeProjectMeta(true);
      setAssetExportIncludeBusinessLogo(true);
      setAssetExportIncludeCustomerLogo(singleProjectHasCustomer);
      setAssetExportDialogOpen(true);
    },
    [],
  );

  const exportAssetDataset = useCallback(
    async (params: AssetExportDatasetParams) => {
      if (assetExportSelectedColumnIds.length === 0) {
        alert("Select at least one column to export.");
        return;
      }

      setAssetExportRunning(true);
      try {
        const report = await buildAssetExportPackage({
          ...params,
          selectedColumnIds: assetExportSelectedColumnIds,
          includeBusinessLogo: assetExportIncludeBusinessLogo,
          includeCustomerLogo: assetExportIncludeCustomerLogo,
          includeProjectMeta: assetExportIncludeProjectMeta,
        });

        if (assetExportFormat === "json") {
          downloadBlob(
            new Blob([JSON.stringify({
              exportedAt: report.exportDateDisplay,
              mode: report.modeLabel,
              metadata: report.metadata,
              logos: {
                business: assetExportIncludeBusinessLogo ? report.businessLogo : null,
                customer: assetExportIncludeCustomerLogo ? report.customerLogo : null,
              },
              columns: report.columns.map((column) => column.label),
              rows: report.rows.map((row) => Object.fromEntries(report.columns.map((column, index) => [column.label, row[index] ?? ""]))),
            }, null, 2)], { type: "application/json" }),
            `${report.filenameBase}.json`,
          );
        } else if (assetExportFormat === "excel") {
          const workbook = await buildAssetExportWorkbook(report);
          const XLSX = await import("xlsx");
          XLSX.writeFile(workbook, `${report.filenameBase}.xlsx`);
        } else {
          const pdfHtml = buildAssetExportHtml(report, { excel: false });
          openPrintWindow(pdfHtml, true);
        }
        setAssetExportDialogOpen(false);
      } catch (error) {
        console.error("[useAssetInstallationAssetExport] asset export failed", error);
        alert(error instanceof Error ? error.message : "Failed to export assets.");
      } finally {
        setAssetExportRunning(false);
      }
    },
    [
      assetExportFormat,
      assetExportIncludeBusinessLogo,
      assetExportIncludeCustomerLogo,
      assetExportIncludeProjectMeta,
      assetExportSelectedColumnIds,
    ],
  );

  return {
    assetExportDialogOpen,
    setAssetExportDialogOpen,
    assetExportFormat,
    setAssetExportFormat,
    assetExportSelectedColumnIds,
    setAssetExportSelectedColumnIds,
    assetExportIncludeProjectMeta,
    setAssetExportIncludeProjectMeta,
    assetExportIncludeBusinessLogo,
    setAssetExportIncludeBusinessLogo,
    assetExportIncludeCustomerLogo,
    setAssetExportIncludeCustomerLogo,
    assetExportRunning,
    openAssetExportDialog,
    exportAssetDataset,
  };
}
