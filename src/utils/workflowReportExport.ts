import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from "docx";
import type { AssetWorkflowRun, RunIssue, StepResult } from "../types/assetWorkflowRun";
import type { Feature } from "../types/feature";
import type { ProjectAsset } from "../types/projectAsset";
import type { SignatureEvent } from "../types/signature";
import type { WorkflowStep } from "../types/workflow";
import { formatInstant, resolveProjectTimeZone } from "./datetime";
import { normalizeCapturedValueForDisplay } from "./capturedValueFormat";

export interface WorkflowReportExportContext {
  run: AssetWorkflowRun;
  asset: ProjectAsset;
  workflowConfigName: string;
  businessLogoBase64?: string | null;
  customerLogoBase64?: string | null;
  customerName?: string;
  jobNumber?: string;
  siteName?: string;
  siteLocation?: string;
  assignedTechnician?: string;
  documentType?: string;
  /** IANA timezone id (project site) for rendering wall-clock timestamps in reports. */
  timeZoneId?: string;
  signatureEvents: SignatureEvent[];
  productFeatures?: Feature[];
}

interface AsBuiltField {
  key?: string;
  label?: string;
  value?: string;
  unit?: string;
  stepTitle?: string;
  capturedAt?: string;
  iterationIndex?: number;
  featureId?: string;
  featureName?: string;
  manufacturerPartNumber?: string;
  businessPartNumber?: string;
  fieldKey?: string;
  selectedValue?: string;
  allOptions?: string[];
}

export interface CapturedFieldExport {
  stepId: string;
  stepTitle?: string;
  iterationIndex?: number;
  inputId: string;
  inputLabel: string;
  inputType: string;
  featureId?: string;
  featureName?: string;
  manufacturerPartNumber?: string;
  businessPartNumber?: string;
  fieldKey?: string;
  selectedValue: string;
  allOptions?: string[];
  capturedAt?: string;
}

interface WorkflowReportJson {
  generatedAt: string;
  documentType: string;
  workflowConfigName: string;
  asset: {
    id: string;
    assetTag: string;
    assetName?: string;
    serialNumber?: string;
    assetModel?: string;
    manufacturer?: string;
    location?: string;
    status: string;
    configLabel?: string;
  };
  project: {
    customerName?: string;
    jobNumber?: string;
    siteName?: string;
    siteLocation?: string;
    assignedTechnician?: string;
  };
  run: {
    id: string;
    runNumber: number;
    status: string;
    isLocked: boolean;
    signatureStatus: string;
    startedAt: string;
    completedAt?: string;
    productiveSeconds: number;
    downtimeSeconds: number;
    downtimeEvents: number;
    completedByName?: string;
  };
  asBuilt: {
    completedAt?: string;
    fields: AsBuiltField[];
  };
  capturedFields: CapturedFieldExport[];
  issues: RunIssue[];
  signatures: SignatureEvent[];
}

function parseAsBuiltJson(json?: string): { completedAt?: string; fields: AsBuiltField[] } {
  if (!json) return { fields: [] };
  try {
    const parsed = JSON.parse(json) as { completedAt?: string; fields?: AsBuiltField[] };
    return {
      completedAt: parsed.completedAt,
      fields: Array.isArray(parsed.fields) ? parsed.fields : [],
    };
  } catch {
    return { fields: [] };
  }
}

function parseIssues(json: string): RunIssue[] {
  try {
    return JSON.parse(json || "[]") as RunIssue[];
  } catch {
    return [];
  }
}

function parseWorkflowSteps(snapshotJson: string): WorkflowStep[] {
  try {
    const snapshot = JSON.parse(snapshotJson) as { stepsJson?: string; steps?: WorkflowStep[] };
    if (snapshot?.stepsJson) {
      const parsed = JSON.parse(snapshot.stepsJson) as WorkflowStep[] | { steps?: WorkflowStep[] };
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.steps)) return parsed.steps;
    }
    if (Array.isArray(snapshot?.steps)) return snapshot.steps;
  } catch {
    // ignore malformed snapshot
  }
  return [];
}

function parseStepResults(json: string): StepResult[] {
  try {
    return (JSON.parse(json || "[]") as StepResult[]).filter((item) => item.stepId !== "__nav__");
  } catch {
    return [];
  }
}

export function buildCapturedFields(context: WorkflowReportExportContext): CapturedFieldExport[] {
  const steps = parseWorkflowSteps(context.run.workflowSnapshotJson);
  const stepResults = parseStepResults(context.run.stepResultsJson);
  const featureMap = new Map((context.productFeatures ?? []).map((feature) => [feature.id, feature]));
  const rows: CapturedFieldExport[] = [];

  for (const result of stepResults) {
    const step = steps.find((item) => item.id === result.stepId);
    const values = result.values ?? {};
    for (const [inputId, rawValue] of Object.entries(values)) {
      const inputDef = step?.inputs?.find((item) => item.id === inputId);
      const captureDef = inputDef ? undefined : step?.captureFields?.find((item) => item.id === inputId);
      const featureId = inputDef?.featureId ?? captureDef?.featureId ?? step?.stepFeatureId;
      const feature = featureId ? featureMap.get(featureId) : undefined;
      const inputType = inputDef?.type ?? (captureDef ? `capture:${captureDef.type}` : "unknown");
      rows.push({
        stepId: result.stepId,
        stepTitle: step?.title,
        iterationIndex: result.iterationIndex,
        inputId,
        inputLabel: inputDef?.label ?? captureDef?.label ?? inputId,
        inputType,
        featureId,
        featureName: feature?.name,
        manufacturerPartNumber: feature?.manufacturerPartNumber,
        businessPartNumber: feature?.alternativePartNumber,
        fieldKey: captureDef?.key ?? inputDef?.id ?? inputId,
        selectedValue: normalizeCapturedValueForDisplay(rawValue),
        allOptions: inputDef?.type === "choice" ? (inputDef.options ?? []) : undefined,
        capturedAt: result.completedAt,
      });
    }
  }

  return rows;
}

function enrichAsBuiltFields(fields: AsBuiltField[], capturedFields: CapturedFieldExport[]): AsBuiltField[] {
  return fields.map((field) => {
    const match = capturedFields.find((item) => {
      if (field.featureId && item.featureId === field.featureId) {
        if (field.key && item.fieldKey) return item.fieldKey === field.key;
        return true;
      }
      if (field.key && item.fieldKey === field.key) return true;
      const sameStep = field.stepTitle && item.stepTitle && field.stepTitle === item.stepTitle;
      const sameLabel = field.label && item.inputLabel && field.label === item.inputLabel;
      return Boolean(sameStep && sameLabel);
    });

    return {
      ...field,
      featureId: field.featureId ?? match?.featureId,
      featureName: field.featureName ?? match?.featureName,
      manufacturerPartNumber: field.manufacturerPartNumber ?? match?.manufacturerPartNumber,
      businessPartNumber: field.businessPartNumber ?? match?.businessPartNumber,
      fieldKey: field.fieldKey ?? field.key ?? match?.fieldKey,
      selectedValue: field.selectedValue ?? field.value ?? match?.selectedValue,
      allOptions: field.allOptions ?? match?.allOptions,
    };
  });
}

function parseImageDataUrl(dataUrl?: string): { data: Uint8Array; type: "png" | "jpg" | "gif" | "bmp" } | null {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const parts = dataUrl.split(",", 2);
  if (parts.length !== 2) return null;

  let type: "png" | "jpg" | "gif" | "bmp" | null = null;
  if (parts[0].includes("image/png")) type = "png";
  else if (parts[0].includes("image/jpeg") || parts[0].includes("image/jpg")) type = "jpg";
  else if (parts[0].includes("image/gif")) type = "gif";
  else if (parts[0].includes("image/bmp")) type = "bmp";
  else return null;

  try {
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { data: bytes, type };
  } catch {
    return null;
  }
}

function safeDate(value?: string, timeZoneId?: string): string {
  if (!value) return "-";
  const tz = resolveProjectTimeZone(timeZoneId);
  return formatInstant(value, tz, { withZone: true });
}

function line(label: string, value?: string | number | null): Paragraph {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun(String(value ?? "-")),
    ],
  });
}

export function workflowReportBaseFileName(asset: ProjectAsset, run: AssetWorkflowRun): string {
  const safeName = (asset.assetTag ?? "asset").replace(/[^a-zA-Z0-9-_]/g, "_");
  const runNum = run.runNumber ?? 1;
  return `installation-record_${safeName}_run${runNum}`;
}

export function buildWorkflowReportJson(context: WorkflowReportExportContext): WorkflowReportJson {
  const { asset, run, workflowConfigName, customerName, jobNumber, siteName, siteLocation, assignedTechnician, documentType, signatureEvents } = context;
  const capturedFields = buildCapturedFields(context);
  const asBuilt = parseAsBuiltJson(asset.asBuiltJson);
  const enrichedAsBuilt = { ...asBuilt, fields: enrichAsBuiltFields(asBuilt.fields, capturedFields) };
  return {
    generatedAt: new Date().toISOString(),
    documentType: documentType ?? "installation",
    workflowConfigName,
    asset: {
      id: asset.id,
      assetTag: asset.assetTag,
      assetName: asset.assetName,
      serialNumber: asset.serialNumber,
      assetModel: asset.assetModel,
      manufacturer: asset.manufacturer,
      location: asset.location,
      status: asset.status,
      configLabel: asset.configLabel,
    },
    project: {
      customerName,
      jobNumber,
      siteName,
      siteLocation,
      assignedTechnician,
    },
    run: {
      id: run.id,
      runNumber: run.runNumber,
      status: run.status,
      isLocked: run.isLocked,
      signatureStatus: run.signatureStatus,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      productiveSeconds: run.productiveSeconds,
      downtimeSeconds: run.downtimeSeconds,
      downtimeEvents: run.downtimeEvents,
      completedByName: run.completedByName,
    },
    asBuilt: enrichedAsBuilt,
    capturedFields,
    issues: parseIssues(run.issuesJson),
    signatures: signatureEvents,
  };
}

export async function createWorkflowReportDocx(context: WorkflowReportExportContext): Promise<Blob> {
  const report = buildWorkflowReportJson(context);
  const tz = context.timeZoneId;
  const title = report.documentType === "inspection" ? "Inspection Report" : "Installation Report";
  const children: Array<Paragraph> = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 220 } }),
    new Paragraph({ text: report.workflowConfigName, heading: HeadingLevel.HEADING_1, spacing: { after: 180 } }),
    line("Asset Tag", report.asset.assetTag),
    line("Asset Name", report.asset.assetName),
    line("Serial Number", report.asset.serialNumber),
    line("Asset Model", report.asset.assetModel),
    line("Manufacturer", report.asset.manufacturer),
    line("Location", report.project.siteLocation ?? report.asset.location),
    line("Status", report.asset.status),
    line("Configuration", report.asset.configLabel),
    line("Customer", report.project.customerName),
    line("Job Number", report.project.jobNumber),
    line("Site Name", report.project.siteName),
    line("Assigned Technician", report.project.assignedTechnician),
    line("Run Number", report.run.runNumber),
    line("Run Status", report.run.status),
    line("Signature Status", report.run.signatureStatus),
    line("Started", safeDate(report.run.startedAt, tz)),
    line("Completed", safeDate(report.run.completedAt, tz)),
    line("Completed By", report.run.completedByName),
    new Paragraph({ text: "Captured Data", heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 140 } }),
  ];

  if (report.asBuilt.fields.length === 0) {
    children.push(new Paragraph({ text: "No captured data recorded.", spacing: { after: 120 } }));
  } else {
    for (const field of report.asBuilt.fields) {
      const suffix = field.unit ? ` ${field.unit}` : "";
      const stepText = field.stepTitle ? ` (${field.stepTitle})` : "";
      children.push(new Paragraph({ text: `${field.label ?? field.key ?? "Field"}: ${field.value ?? ""}${suffix}${stepText}`, spacing: { after: 100 } }));
    }
  }

  children.push(new Paragraph({ text: "Issues", heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 140 } }));
  if (report.issues.length === 0) {
    children.push(new Paragraph({ text: "No issues recorded.", spacing: { after: 120 } }));
  } else {
    for (const issue of report.issues) {
      children.push(new Paragraph({ text: `${issue.severity.toUpperCase()} - ${issue.description}`, spacing: { after: 100 } }));
      children.push(line("Reported", safeDate(issue.reportedAt, tz)));
      children.push(line("Resolved", issue.resolved ? "Yes" : "No"));
      if (issue.resolutionNote) children.push(line("Resolution Note", issue.resolutionNote));
    }
  }

  children.push(new Paragraph({ text: "Signatures", heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 140 } }));
  if (report.signatures.length === 0) {
    children.push(new Paragraph({ text: "No signatures captured.", spacing: { after: 120 } }));
  } else {
    for (const signature of report.signatures) {
      children.push(new Paragraph({ text: `${signature.signerRole} Sign-off`, heading: HeadingLevel.HEADING_2, spacing: { before: 120, after: 100 } }));
      children.push(line("Name", signature.signerName));
      children.push(line("Title", signature.signerTitle));
      children.push(line("Signed At", safeDate(signature.signedAtUtc, tz)));
      children.push(line("Outcome", signature.reasonCode));
      children.push(line("Notes", signature.notes));
      const signatureImage = signature.hasDrawnSignature ? parseImageDataUrl(signature.signatureData) : null;
      if (signatureImage) {
        children.push(new Paragraph({
          spacing: { after: 180 },
          children: [
            new ImageRun({
              data: signatureImage.data,
              type: signatureImage.type,
              transformation: { width: 220, height: 80 },
            }),
          ],
        }));
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}
