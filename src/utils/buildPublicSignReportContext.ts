import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { Feature } from "../types/feature";
import type { ProjectAsset } from "../types/projectAsset";
import type { PublicRunSummary, SignatureEvent } from "../types/signature";
import { resolveReportTimeZone } from "./datetime";
import { resolveImageToDataUrl, resolvePhotoForPdf, type GenerateReportParams } from "./generateWorkflowReport";
import { normalizeBinaryDataUrl } from "./reportMediaResolve";

function parseProductFeatures(json?: string | null): Feature[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as Feature[];
  } catch {
    return [];
  }
}

async function hydrateCaptureValue(val: string): Promise<string> {
  if (!val.trim()) return val;

  try {
    const parsed = JSON.parse(val) as unknown;
    if (Array.isArray(parsed)) {
      const next = await Promise.all(
        parsed.map(async (item) => {
          if (typeof item !== "string" || !item.trim()) return item;
          const normalized = normalizeBinaryDataUrl(item.trim());
          const resolved = await resolvePhotoForPdf(normalized);
          return resolved ?? normalized;
        }),
      );
      return JSON.stringify(next);
    }
  } catch {
    /* single value */
  }

  const normalized = normalizeBinaryDataUrl(val.trim());
  const resolved = await resolvePhotoForPdf(normalized);
  return resolved ?? normalized;
}

async function hydrateStepResultsMediaForReport(stepResultsJson: string): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stepResultsJson);
  } catch {
    return stepResultsJson;
  }
  if (!Array.isArray(parsed)) return stepResultsJson;

  const next = await Promise.all(
    parsed.map(async (entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const raw = entry as Record<string, unknown>;
      const stepId = raw.stepId ?? raw.StepId;
      if (typeof stepId !== "string" || stepId === "__nav__") return entry;

      const valuesRaw = raw.values ?? raw.Values;
      if (!valuesRaw || typeof valuesRaw !== "object" || Array.isArray(valuesRaw)) return entry;

      const values = valuesRaw as Record<string, string>;
      const hydratedEntries = await Promise.all(
        Object.entries(values).map(async ([key, value]) => {
          if (typeof value !== "string") return [key, value] as const;
          return [key, await hydrateCaptureValue(value)] as const;
        }),
      );

      return {
        ...raw,
        stepId,
        values: Object.fromEntries(hydratedEntries),
      };
    }),
  );

  return JSON.stringify(next);
}

/** Build the same report inputs the internal View/Export dialog uses, from the public sign summary. */
export async function buildPublicSignReportContext(
  summary: PublicRunSummary,
): Promise<Omit<GenerateReportParams, "includeAllSteps" | "outputMode" | "allowDownloadFallback">> {
  const startedAt = summary.startedAt ?? summary.completedAt;
  const stepResultsJson = await hydrateStepResultsMediaForReport(summary.stepResultsJson ?? "[]");

  const run: AssetWorkflowRun = {
    id: summary.runId,
    assetId: "",
    workflowConfigId: "",
    workflowVersion: 1,
    workflowSnapshotJson: summary.workflowSnapshotJson,
    status: "Complete",
    isLocked: true,
    stepResultsJson,
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
    timeZoneId: resolveReportTimeZone({
      timeZoneId: summary.timeZoneId,
      office: summary.office,
      region: summary.region,
      officeCountry: summary.officeCountry,
      officeState: summary.officeState,
    }),
    signatureEvents,
    productFeatures: parseProductFeatures(summary.productFeaturesJson),
  };
}
