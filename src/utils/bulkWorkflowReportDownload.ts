import JSZip from "jszip";
import { generateWorkflowReport } from "./generateWorkflowReport";
import { workflowReportBaseFileName, type WorkflowReportExportContext } from "./workflowReportExport";

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function buildWorkflowReportPdfBlob(
  context: WorkflowReportExportContext,
): Promise<Blob> {
  const result = await generateWorkflowReport({
    ...context,
    outputMode: "blob",
  });
  if (!(result instanceof Blob)) {
    throw new Error("Failed to generate workflow report PDF.");
  }
  return result;
}

export type WorkflowReportDownloadItem = {
  context: WorkflowReportExportContext;
  blob: Blob;
};

export function workflowReportPdfFileName(context: WorkflowReportExportContext): string {
  return `${workflowReportBaseFileName(context.asset, context.run)}.pdf`;
}

export async function downloadWorkflowReportsAsSeparateFiles(
  items: WorkflowReportDownloadItem[],
): Promise<void> {
  for (const item of items) {
    downloadBlob(item.blob, workflowReportPdfFileName(item.context));
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
}

export async function downloadWorkflowReportsAsZip(
  items: WorkflowReportDownloadItem[],
  zipFileName: string,
): Promise<void> {
  const zip = new JSZip();
  for (const item of items) {
    zip.file(workflowReportPdfFileName(item.context), item.blob);
  }
  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, zipFileName.endsWith(".zip") ? zipFileName : `${zipFileName}.zip`);
}
