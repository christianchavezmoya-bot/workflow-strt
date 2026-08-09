import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { Feature } from "../types/feature";
import type { ProjectAsset } from "../types/projectAsset";
import type { PublicRunSummary, SignatureEvent } from "../types/signature";
import { resolveReportTimeZone } from "./datetime";
import { resolveImageToDataUrl, type GenerateReportParams } from "./generateWorkflowReport";

function parseProductFeatures(json?: string | null): Feature[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as Feature[];
  } catch {
    return [];
  }
}

/** Build the same report inputs the internal View/Export dialog uses, from the public sign summary. */
export async function buildPublicSignReportContext(
  summary: PublicRunSummary,
): Promise<Omit<GenerateReportParams, "includeAllSteps" | "outputMode" | "allowDownloadFallback">> {
  const startedAt = summary.startedAt ?? summary.completedAt;

  const run: AssetWorkflowRun = {
    id: summary.runId,
    assetId: "",
    workflowConfigId: "",
    workflowVersion: 1,
    workflowSnapshotJson: summary.workflowSnapshotJson,
    status: "Complete",
    isLocked: true,
    stepResultsJson: summary.stepResultsJson,
    issuesJson: summary.issuesJson,
    timeTrackingJson: summary.timeTrackingJson ?? "[]",
    productiveSeconds: summary.productiveSeconds ?? 0,
    downtimeSeconds: summary.downtimeSeconds ?? 0,
    downtimeEvents: summary.downtimeEvents ?? 0,
    runNumber: summary.runNumber ?? 1,
    completedByName: summary.completedByName,
    signatureStatus: summary.signatureStatus,
    completedAt: summary.completedAt,
    startedAt,
    createdAt: startedAt,
    updatedAt: summary.completedAt,
  };

  const asset: ProjectAsset = {
    id: "",
    projectId: "",
    productId: "",
    assetTag: summary.assetTag ?? summary.assetName,
    assetName: summary.assetName,
    assetModel: summary.assetModel,
    manufacturer: summary.manufacturer,
    serialNumber: summary.assetSerial || undefined,
    location: summary.assetLocation,
    status: "Complete",
    featureValuesJson: "{}",
    issuesJson: "[]",
    createdAt: summary.completedAt,
    updatedAt: summary.completedAt,
  };

  const signatureEvents: SignatureEvent[] = [];
  if (summary.installerSignerName) {
    signatureEvents.push({
      id: "installer",
      runId: summary.runId,
      signerRole: "Installer",
      signerName: summary.installerSignerName,
      signedAtUtc: summary.installerSignedAt ?? summary.completedAt,
      hasDrawnSignature: !!summary.installerSignatureData,
      signatureData: summary.installerSignatureData,
      reasonCode: (summary.installerReasonCode ?? "Completed") as SignatureEvent["reasonCode"],
      notes: summary.installerNotes,
    });
  }

  const [businessLogoBase64, customerLogoBase64] = await Promise.all([
    summary.businessLogoBase64 ? resolveImageToDataUrl(summary.businessLogoBase64) : Promise.resolve(null),
    summary.customerLogoBase64 ? resolveImageToDataUrl(summary.customerLogoBase64) : Promise.resolve(null),
  ]);

  return {
    run,
    asset,
    workflowConfigName: summary.workflowName,
    businessLogoBase64,
    customerLogoBase64,
    companyName: summary.companyName ?? undefined,
    customerName: summary.customerName,
    jobNumber: summary.projectJobNumber,
    siteName: summary.siteName,
    siteLocation: summary.assetLocation,
    assignedTechnician: summary.assignedTechnicianName,
    timeZoneId: resolveReportTimeZone({ timeZoneId: summary.timeZoneId }),
    signatureEvents,
    productFeatures: parseProductFeatures(summary.productFeaturesJson),
  };
}
