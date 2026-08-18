import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  AddOutlined,
  ArticleOutlined,
  ArrowBackOutlined,
  ArchiveOutlined,
  BuildOutlined,
  ContentCopyOutlined,
  DeleteOutline,
  DownloadOutlined,
  FormatListBulletedOutlined,
  PublishOutlined,
  RemoveOutlined,
  SearchOutlined,
  SettingsOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  IconButton,
  InputAdornment,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  Select,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { FeatureSelection } from "../../services/productConfigService";
import { workflowConfigService } from "../../services/workflowConfigService";
import { featureService } from "../../services/featureService";
import { workflowTypeService } from "../../services/workflowTypeService";
import { usePermissions } from "../../hooks/usePermissions";
import { useAppToast } from "../../contexts/AppToastContext";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProducts } from "../../store/productsSlice";
import type { Feature } from "../../types/feature";
import type { ProductFeatureDefinition } from "../../types/product";
import type { Workflow } from "../../types/workflow";
import type { CaptureField, StepInput, WorkflowStep } from "../../types/workflow";
import { isOptionListInputType } from "../../types/workflow";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowType } from "../../types/workflowType";
import { escapeHtml, openPrintWindow } from "../../utils/printWindow";
import { isMobileNativePlatform } from "../../utils/platform";
import WorkOrderRunner from "./WorkOrderRunner";
import { jsPDF } from "jspdf";

const WorkflowBuilder = lazy(() => import("./WorkflowBuilder"));

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function parseSteps(cfg: WorkflowConfig): Workflow | null {
  try {
    const parsed = JSON.parse(cfg.stepsJson);
    if (parsed && Array.isArray(parsed.steps)) return parsed as Workflow;
    if (Array.isArray(parsed)) {
      return { id: cfg.id, name: cfg.name, productId: cfg.productId, createdAt: Date.now(), steps: parsed, media: [] };
    }
  } catch {}
  return null;
}

function downloadJson(cfg: WorkflowConfig, productName: string) {
  const blob = new Blob(
    [JSON.stringify({ ...cfg, productName }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `work-instruction-${cfg.name.replace(/\s+/g, "-").toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

type WorkflowFeatureDefinition = ProductFeatureDefinition & { isInventory?: boolean };

function toWorkflowFeatureDefinition(
  feature: Feature,
  legacy?: ProductFeatureDefinition,
): WorkflowFeatureDefinition {
  return {
    id: feature.id,
    name: feature.name,
    valueType: (feature.valueType || legacy?.valueType || "text") as ProductFeatureDefinition["valueType"],
    options: feature.options ?? legacy?.options,
    // Keep legacy sub-properties only as a compatibility fallback. Builder capture data
    // comes from Feature Dependencies, but older draft behavior still expects this shape.
    subProperties: legacy?.subProperties ?? feature.subProperties?.map((subProperty) => ({
      id: subProperty.id,
      name: subProperty.name,
      valueType: "text" as const,
      isInventory: subProperty.isInventory,
      unit: subProperty.unit,
    })),
    isInventory: feature.isInventory ?? false,
  };
}

function printPdf(cfg: WorkflowConfig, productName: string) {
  const workflow = parseSteps(cfg);
  const steps = workflow?.steps ? [...workflow.steps].sort((a, b) => a.order - b.order) : [];
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const previewFrameX = margin;
  const previewFrameY = margin + 16;
  const previewFrameW = contentWidth;
  const previewFrameH = pageHeight - previewFrameY - margin;
  const sidebarW = 42;
  const headerH = 22;
  const bodyTop = previewFrameY + headerH;
  const innerPad = 6;
  const contentX = previewFrameX + sidebarW + innerPad;
  const contentW = previewFrameW - sidebarW - innerPad * 2;

  const fieldTypeLabel = (input: StepInput | CaptureField) => {
    const baseType = input.type.toUpperCase();
    if (isOptionListInputType(input.type) && "options" in input && input.options && input.options.length > 0) {
      return `${baseType} · ${input.options.join(" / ")}`;
    }
    if ("unit" in input && input.unit) {
      return `${baseType} · ${input.unit}`;
    }
    return baseType;
  };

  const stepFieldEntries = (step: WorkflowStep) => [
    ...(step.inputs ?? []).map((field) => ({ field, variant: "input" as const })),
    ...(step.captureFields ?? []).map((field) => ({ field, variant: "capture" as const })),
  ];

  const drawTextBlock = (text: string, x: number, y: number, maxWidth: number, fontSize: number, color: string, fontStyle: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text || "", maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * (fontSize * 0.52);
  };

  const drawFieldCard = (
    field: StepInput | CaptureField,
    y: number,
    variant: "input" | "capture",
  ) => {
    const label = `${field.label || "Untitled field"}${field.required ? " *" : ""}`;
    const labelLines = doc.splitTextToSize(label, 58);
    const cardHeight = Math.max(17, 10 + labelLines.length * 4.4);
    const cardX = contentX;
    const cardWidth = contentW;
    doc.setDrawColor(variant === "capture" ? "#2f4657" : "#23313d");
    doc.setFillColor("#141c24");
    doc.roundedRect(cardX, y, cardWidth, cardHeight, 4, 4, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor("#f8fafc");
    doc.text(labelLines, cardX + 4, y + 5.2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor("#7d8d9f");
    doc.text(fieldTypeLabel(field), cardX + 4, y + cardHeight - 3.4);

    const lineStartX = cardX + Math.min(72, cardWidth * 0.4);
    const lineY = y + cardHeight / 2;
    doc.setDrawColor("#415262");
    doc.line(lineStartX, lineY, cardX + cardWidth - 4, lineY);

    return y + cardHeight + 4;
  };

  const drawChip = (
    label: string,
    x: number,
    y: number,
    fill: string,
    stroke: string,
    textColor: string,
    width?: number,
  ) => {
    const chipWidth = width ?? Math.max(18, doc.getTextWidth(label) + 8);
    doc.setFillColor(fill);
    doc.setDrawColor(stroke);
    doc.roundedRect(x, y, chipWidth, 7.2, 3.6, 3.6, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(textColor);
    doc.text(label, x + chipWidth / 2, y + 4.75, { align: "center" });
    return chipWidth;
  };

  const drawStepRail = (activeIndex: number) => {
    doc.setFillColor("#131b22");
    doc.rect(previewFrameX, bodyTop, sidebarW, previewFrameH - headerH, "F");
    doc.setDrawColor("#22303d");
    doc.line(previewFrameX + sidebarW, bodyTop, previewFrameX + sidebarW, previewFrameY + previewFrameH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor("#94a3b8");
    doc.text("STEPS", previewFrameX + 3, bodyTop + 7);

    let railY = bodyTop + 11;
    steps.forEach((step, idx) => {
      const stepInputs = stepFieldEntries(step).length;
      const itemH = 16;
      if (railY + itemH > previewFrameY + previewFrameH - 8) return;
      if (idx === activeIndex) {
        doc.setFillColor("#1c4648");
        doc.rect(previewFrameX, railY - 4, sidebarW, itemH, "F");
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(idx === activeIndex ? "#d7fffb" : "#9aa9b8");
      doc.text(String(step.order ?? idx + 1).padStart(2, "0"), previewFrameX + 3, railY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      doc.setTextColor(idx === activeIndex ? "#f8fafc" : "#d1d9e2");
      const titleLines = doc.splitTextToSize(step.title || "(Untitled step)", sidebarW - 8);
      doc.text(titleLines.slice(0, 2), previewFrameX + 3, railY + 4.6);

      doc.setFontSize(6.8);
      doc.setTextColor(idx === activeIndex ? "#b7d4d1" : "#79889a");
      doc.text(`${stepInputs} field${stepInputs === 1 ? "" : "s"}`, previewFrameX + 3, railY + 11.2);

      railY += itemH;
    });
  };

  const drawStepPage = (step: WorkflowStep, index: number) => {
    if (index > 0) doc.addPage();

    doc.setFillColor("#081219");
    doc.rect(0, 0, pageWidth, pageHeight, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor("#d8e1ea");
    doc.text("Workflow Preview", previewFrameX, margin + 6);

    doc.setFillColor("#091016");
    doc.setDrawColor("#16424d");
    doc.roundedRect(previewFrameX, previewFrameY, previewFrameW, previewFrameH, 8, 8, "FD");

    doc.setFillColor("#0d2a31");
    doc.roundedRect(previewFrameX, previewFrameY, previewFrameW, headerH, 8, 8, "F");
    doc.rect(previewFrameX, previewFrameY + headerH - 8, previewFrameW, 8, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor("#f8fafc");
    doc.text(cfg.name, previewFrameX + 4, previewFrameY + 8.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor("#cbd5e1");
    doc.text(`Product: ${productName || "-"}`, previewFrameX + 4, previewFrameY + 15.5);
    doc.text(`Type: ${cfg.configType || "-"}`, previewFrameX + 42, previewFrameY + 15.5);
    doc.text(formatDate(cfg.createdAt), previewFrameX + 74, previewFrameY + 15.5);

    drawChip("Published", previewFrameX + previewFrameW - 28, previewFrameY + 5, "#22c55e", "#22c55e", "#ffffff", 14);
    drawChip(`v${cfg.version}`, previewFrameX + previewFrameW - 12, previewFrameY + 5, "#0d2a31", "#90a4ae", "#dfe9f3", 9);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor("#a7b5c4");
    doc.text(`${steps.length} step${steps.length === 1 ? "" : "s"}`, previewFrameX + previewFrameW - 4, previewFrameY + 14.8, { align: "right" });

    drawStepRail(index);

    doc.setFillColor("#0a1218");
    doc.rect(previewFrameX + sidebarW + 0.2, bodyTop, previewFrameW - sidebarW - 0.2, previewFrameH - headerH, "F");

    let y = bodyTop + 10;
    doc.setFillColor("#0f766e");
    doc.circle(contentX + 2.5, y - 1.3, 4.4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor("#ecfeff");
    doc.text(String(step.order ?? index + 1), contentX + 2.5, y - 0.1, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor("#f8fafc");
    const titleLines = doc.splitTextToSize(step.title || "(Untitled step)", contentW - 12);
    doc.text(titleLines, contentX + 8, y);
    y += titleLines.length * 6.1;

    if (step.description) {
      y = drawTextBlock(step.description, contentX + 8, y + 1.5, contentW - 12, 9.5, "#cbd5e1");
    }

    y += 6;
    doc.setDrawColor("#1e293b");
    doc.line(contentX, y, contentX + contentW, y);
    y += 8;

    const allFields = stepFieldEntries(step);

    if (allFields.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor("#99f6e4");
      doc.text("INPUT FIELDS", contentX, y);
      y += 6;

      allFields.forEach(({ field, variant }) => {
        y = drawFieldCard(field, y, variant);
      });
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor("#94a3b8");
      doc.text("No inputs or capture fields on this step.", contentX, y);
      y += 10;
    }

    if (step.decisionsEnabled && (step.decisions?.length ?? 0) > 0) {
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor("#99f6e4");
      doc.text("DECISION BUTTONS", contentX, y);
      y += 6;

      let chipX = contentX;
      step.decisions.forEach((decision) => {
        const label = decision.label || "Decision";
        const chipWidth = Math.min(58, Math.max(24, doc.getTextWidth(label) + 10));
        if (chipX + chipWidth > contentX + contentW) {
          chipX = contentX;
          y += 10;
        }
        drawChip(label, chipX, y - 5, "#10343b", "#2dd4bf", "#d1fae5", chipWidth);
        chipX += chipWidth + 4;
      });
    }

    const footerY = previewFrameY + previewFrameH - 8;
    doc.setDrawColor("#1e293b");
    doc.line(contentX, footerY - 8, contentX + contentW, footerY - 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor("#94a3b8");
    doc.text("Workflow preview snapshot only - no asset run data, no validation enforced.", contentX, footerY);

    const backLabel = index === 0 ? "<- Back" : "<- Previous";
    const nextLabel = index === steps.length - 1 ? "Preview complete" : "Next step ->";
    const backW = Math.max(18, doc.getTextWidth(backLabel) + 7);
    const nextW = Math.max(21, doc.getTextWidth(nextLabel) + 8);
    const actionY = footerY - 4;
    const actionRightX = contentX + contentW;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor("#8ea0b0");
    doc.text(`Step ${index + 1} of ${steps.length}`, actionRightX - nextW - 12, actionY + 4.4, { align: "right" });

    drawChip(backLabel, contentX, actionY, "#0a1218", "#415262", index === 0 ? "#5b6875" : "#d7dee7", backW);
    drawChip(nextLabel, actionRightX - nextW, actionY, "#0f766e", "#14b8a6", "#d8fffb", nextW);
  };

  if (steps.length === 0) {
    doc.setFillColor("#081219");
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor("#f8fafc");
    doc.text(cfg.name, margin, margin + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor("#94a3b8");
    doc.text("No workflow steps defined.", margin, margin + 22);
  } else {
    steps.forEach((step, index) => drawStepPage(step, index));
  }

  const safeName = cfg.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  doc.save(`work-instruction-${safeName || "export"}.pdf`);
}

function printWorkflowPreview(cfg: WorkflowConfig, productName: string) {
  const workflow = parseSteps(cfg);
  const steps = workflow?.steps ? [...workflow.steps].sort((a, b) => a.order - b.order) : [];
  const stepsHtml = steps
    .map(
      (step) => `
      <div style="margin-bottom:16px">
        <div style="font-size:14px;font-weight:600;margin-bottom:4px;padding-bottom:3px;border-bottom:1px solid #ddd">${escapeHtml(step.title)}</div>
        ${step.description ? `<p style="margin:0 0 6px;font-size:12px;color:#666">${escapeHtml(step.description)}</p>` : ""}
      </div>`,
    )
    .join("");

  const html = `<html><head><title>Workflow - ${escapeHtml(cfg.name)}</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;color:#1a1a1a}@media print{body{padding:0}}</style>
    </head><body>
    <h2 style="margin:0 0 4px">Workflow: ${escapeHtml(cfg.name)}</h2>
    <p style="margin:0 0 16px;font-size:13px;color:#666">
      Product: ${escapeHtml(productName)}&nbsp;|&nbsp;
      Configuration Type: ${escapeHtml(cfg.configType ?? "-")}&nbsp;|&nbsp;
      Status: ${escapeHtml(cfg.status)}&nbsp;|&nbsp;v${escapeHtml(cfg.version)}
    </p>
    ${stepsHtml || "<p>No workflow steps defined.</p>"}
    </body></html>`;

  if (!openPrintWindow(html, true)) {
    console.warn("[WorkInstructions] Print popup was blocked -- allow popups for this site to print.");
  }
}

// â”€â”€â”€ Status chip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StatusChip({ status }: { status: string }) {
  const color =
    status === "Published" ? "success"
    : status === "Archived" ? "default"
    : "warning";
  return <Chip size="small" label={status} color={color as "success" | "default" | "warning"} />;
}

// â”€â”€â”€ Preview dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface PreviewProps {
  open: boolean;
  cfg: WorkflowConfig;
  productName: string;
  onClose: () => void;
}

function PreviewDialog({ open, cfg, productName, onClose }: PreviewProps) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const isNative = isMobileNativePlatform();
  const [activeStep, setActiveStep] = useState(0);

  const workflow = useMemo(() => parseSteps(cfg), [cfg]);
  const steps = useMemo(
    () => (workflow?.steps ? [...workflow.steps].sort((a, b) => a.order - b.order) : []),
    [workflow],
  );
  const currentStep = steps[activeStep] ?? null;

  useEffect(() => {
    if (open) setActiveStep(0);
  }, [open, cfg.id]);

  if (!isNative && workflow) {
    return (
      <WorkOrderRunner
        open={open}
        onClose={onClose}
        workflow={workflow}
        productId={cfg.productId}
        productName={productName}
        previewWalkthrough
      />
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: "88vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 4,
          background: "linear-gradient(180deg, rgba(8,18,24,0.98), rgba(8,14,19,0.99))",
          border: "1px solid rgba(45,212,191,0.18)",
        },
      }}
    >
      <Box
        sx={{
          px: { xs: 1.5, sm: 3 },
          py: { xs: 1.5, sm: 2.5 },
          flexShrink: 0,
          background: "linear-gradient(135deg, rgba(13,148,136,0.2), rgba(15,23,42,0.25))",
          borderBottom: "1px solid rgba(148,163,184,0.14)",
        }}
      >
        <Stack direction={isPhone ? "column" : "row"} justifyContent="space-between" alignItems={isPhone ? "stretch" : "flex-start"} spacing={1.5}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} sx={{ fontFamily: "Sora", color: "#f8fafc" }}>
              {cfg.name}
            </Typography>
            <Stack direction="row" spacing={0} flexWrap="wrap" useFlexGap sx={{ mt: 0.5, gap: "4px 16px" }}>
              <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.82)" }}>Product: {productName}</Typography>
              {cfg.configType && (
                <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.82)" }}>Type: {cfg.configType}</Typography>
              )}
              {cfg.createdBy && (
                <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.82)" }}>By: {cfg.createdBy}</Typography>
              )}
              <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.62)" }}>{formatDate(cfg.createdAt)}</Typography>
            </Stack>
            {cfg.notes && (
              <Typography variant="caption" fontStyle="italic" sx={{ color: "rgba(226,232,240,0.68)", mt: 0.75, display: "block" }}>
                {cfg.notes}
              </Typography>
            )}
          </Box>
          <Stack alignItems={isPhone ? "flex-start" : "flex-end"} spacing={0.75} sx={{ flexShrink: 0 }}>
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <StatusChip status={cfg.status} />
              <Chip
                size="small"
                label={`v${cfg.version}`}
                variant="outlined"
                sx={{ color: "#e2e8f0", borderColor: "rgba(255,255,255,0.3)" }}
              />
            </Stack>
            {steps.length > 0 && (
              <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.62)" }}>
                {steps.length} step{steps.length === 1 ? "" : "s"}
              </Typography>
            )}
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ display: "flex", flexDirection: isPhone ? "column" : "row", flex: 1, overflow: "hidden" }}>
        {!workflow || steps.length === 0 ? (
          <Box sx={{ p: 3, flex: 1 }}>
            <Alert severity="info">
              {!workflow
                ? "No workflow steps defined yet."
                : "This workflow has no steps defined yet."}
            </Alert>
          </Box>
        ) : (
          <>
            <Box
              sx={{
                width: isPhone ? "100%" : 220,
                flexShrink: 0,
                borderRight: isPhone ? "none" : "1px solid",
                borderBottom: isPhone ? "1px solid" : "none",
                borderColor: "rgba(148,163,184,0.14)",
                overflowX: isPhone ? "auto" : "hidden",
                overflowY: isPhone ? "hidden" : "auto",
                bgcolor: isPhone ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.03)",
              }}
            >
              <Box sx={{ px: 1.5, pt: 1.25, pb: isPhone ? 0.75 : 1 }}>
                <Typography
                  variant="caption"
                  fontWeight={700}
                  sx={{ color: "rgba(226,232,240,0.62)", textTransform: "uppercase", letterSpacing: 0.6 }}
                >
                  Steps
                </Typography>
              </Box>
              {isPhone ? (
                <Stack direction="row" spacing={1} sx={{ px: 1.5, pb: 1.25, overflowX: "auto" }}>
                  {steps.map((step, idx) => (
                    <Box
                      key={step.id}
                      onClick={() => setActiveStep(idx)}
                      sx={{
                        minWidth: 140,
                        px: 1.25,
                        py: 1,
                        cursor: "pointer",
                        borderRadius: 2.5,
                        border: "1px solid",
                        borderColor: activeStep === idx ? "rgba(45,212,191,0.44)" : "rgba(148,163,184,0.16)",
                        bgcolor: activeStep === idx ? "rgba(45,212,191,0.12)" : "rgba(255,255,255,0.02)",
                      }}
                    >
                      <Typography variant="caption" sx={{ color: activeStep === idx ? "#99f6e4" : "rgba(226,232,240,0.58)", fontWeight: 700 }}>
                        {String(step.order).padStart(2, "0")}
                      </Typography>
                      <Typography variant="body2" fontWeight={600} sx={{ color: "#f8fafc" }} className="line-clamp-2">
                        {step.title || "(Untitled)"}
                      </Typography>
                      {(step.inputs ?? []).length > 0 && (
                        <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.58)" }}>
                          {step.inputs.length} input{step.inputs.length === 1 ? "" : "s"}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              ) : (
                <>
                  <Divider />
                  {steps.map((step, idx) => (
                    <Box
                      key={step.id}
                      onClick={() => setActiveStep(idx)}
                      sx={{
                        px: 1.5,
                        py: 1.25,
                        cursor: "pointer",
                        bgcolor: activeStep === idx ? "rgba(45,212,191,0.16)" : "transparent",
                        color: activeStep === idx ? "#f8fafc" : "text.primary",
                        "&:hover": { bgcolor: activeStep === idx ? "rgba(45,212,191,0.22)" : "rgba(255,255,255,0.04)" },
                        borderBottom: "1px solid",
                        borderColor: "rgba(148,163,184,0.14)",
                        transition: "background-color 0.15s",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: activeStep === idx ? "#99f6e4" : "rgba(226,232,240,0.58)", display: "block", fontWeight: 700, lineHeight: 1.2 }}
                      >
                        {String(step.order).padStart(2, "0")}
                      </Typography>
                      <Typography variant="body2" fontWeight={activeStep === idx ? 600 : 400} noWrap sx={{ color: activeStep === idx ? "#f8fafc" : "#e2e8f0" }}>
                        {step.title || "(Untitled)"}
                      </Typography>
                      {(step.inputs ?? []).length > 0 && (
                        <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.58)" }}>
                          {step.inputs.length} input{step.inputs.length === 1 ? "" : "s"}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </>
              )}
            </Box>

            <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 1.5, sm: 3.5 } }}>
              {currentStep && (
                <Stack spacing={3}>
                  <Box>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          bgcolor: "rgba(45,212,191,0.18)",
                          color: "#99f6e4",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        {currentStep.order}
                      </Box>
                      <Typography variant="h6" fontWeight={600} sx={{ color: "#f8fafc" }}>
                        {currentStep.title || "(Untitled step)"}
                      </Typography>
                    </Stack>
                    {currentStep.description && (
                      <Typography variant="body2" sx={{ color: "rgba(226,232,240,0.72)", pl: { xs: 0, sm: "50px" } }}>
                        {currentStep.description}
                      </Typography>
                    )}
                  </Box>

                  <Divider sx={{ borderColor: "rgba(148,163,184,0.14)" }} />

                  {(currentStep.inputs ?? []).length === 0 ? (
                    <Typography variant="body2" sx={{ color: "rgba(226,232,240,0.46)" }} fontStyle="italic">
                      No input fields for this step.
                    </Typography>
                  ) : (
                    <Stack spacing={0}>
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        sx={{ color: "rgba(153,246,228,0.84)", textTransform: "uppercase", letterSpacing: 0.6, mb: 1.5, display: "block" }}
                      >
                        Input Fields
                      </Typography>
                      {currentStep.inputs.map((inp, i) => (
                        <Box
                          key={inp.id}
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", sm: "230px 1fr" },
                            gap: 2,
                            alignItems: "center",
                            py: 1.5,
                            px: 1.5,
                            bgcolor: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent",
                            borderRadius: 2,
                          }}
                        >
                          <Box>
                            <Typography variant="body2" fontWeight={500} sx={{ color: "#f8fafc" }}>
                              {inp.label}
                              {inp.required && (
                                <Typography component="span" variant="caption" color="error.main" sx={{ ml: 0.5 }}>
                                  *
                                </Typography>
                              )}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ color: "rgba(226,232,240,0.54)", textTransform: "uppercase", letterSpacing: 0.4 }}
                            >
                              {inp.type}
                              {isOptionListInputType(inp.type) && (inp.options ?? []).length > 0
                                ? ` · ${inp.options!.join(" / ")}`
                                : ""}
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              borderBottom: "1.5px solid",
                              borderColor: "rgba(148,163,184,0.36)",
                              minHeight: inp.type === "note" ? 56 : 30,
                            }}
                          />
                        </Box>
                      ))}
                    </Stack>
                  )}

                  {currentStep.decisionsEnabled && (currentStep.decisions ?? []).length > 0 && (
                    <Box>
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        sx={{ color: "rgba(153,246,228,0.84)", textTransform: "uppercase", letterSpacing: 0.6, display: "block", mb: 1 }}
                      >
                        Decision Options
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={1} useFlexGap>
                        {currentStep.decisions.map((d) => (
                          <Chip key={d.id} label={d.label || "(option)"} variant="outlined" size="small" />
                        ))}
                      </Stack>
                    </Box>
                  )}

                  <Stack direction="row" spacing={1} alignItems="center" pt={1} flexWrap="wrap" useFlexGap>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setActiveStep((p) => Math.max(0, p - 1))}
                      disabled={activeStep === 0}
                    >
                      ← Previous
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setActiveStep((p) => Math.min(steps.length - 1, p + 1))}
                      disabled={activeStep === steps.length - 1}
                    >
                      Next →
                    </Button>
                    <Typography variant="caption" sx={{ ml: 1, color: "rgba(226,232,240,0.62)" }}>
                      Step {activeStep + 1} of {steps.length}
                    </Typography>
                  </Stack>
                </Stack>
              )}
            </Box>
          </>
        )}
      </Box>

      <Divider sx={{ borderColor: "rgba(148,163,184,0.14)" }} />
      <DialogActions sx={{ px: { xs: 1.5, sm: 3 }, py: 1.5 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// â”€â”€â”€ Config form state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ConfigFormState {
  name: string;
  configType: string;
  workflowTypeId: string;
  notes: string;
  featureSelections: FeatureSelection[];
}

type WorkInstructionSortKey = "name" | "configType" | "createdBy" | "dateCreated" | "status";

const emptyConfigForm = (): ConfigFormState => ({
  name: "",
  configType: "",
  workflowTypeId: "",
  notes: "",
  featureSelections: [],
});

// â”€â”€â”€ WorkInstructions component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const WorkInstructions = () => {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const can = usePermissions();
  const toast = useAppToast();
  const dispatch = useAppDispatch();
  const productsState = useAppSelector((state) => state.products);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isActiveRoute = location.pathname.startsWith("/work-instructions");
  const allowUrlWritesRef = useRef(true);
  const urlBackfillDoneRef = useRef(false);

  useEffect(() => {
    allowUrlWritesRef.current = location.pathname.startsWith("/work-instructions");
    return () => { allowUrlWritesRef.current = false; };
  }, [location.pathname]);

  const safeSetSearchParams = useCallback((params: Record<string, string>) => {
    if (!allowUrlWritesRef.current) return;
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  const [tab, setTab] = useState(0);
  const [viewMode, setViewMode] = useState<"instructions" | "builder">("instructions");

  const [configs, setConfigs] = useState<WorkflowConfig[]>([]);
  const [workflowTypes, setWorkflowTypes] = useState<WorkflowType[]>([]);
  const [configSearch, setConfigSearch] = useState("");
  const [sortBy, setSortBy] = useState<WorkInstructionSortKey>("dateCreated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<WorkflowConfig | null>(null);
  const [configForm, setConfigForm] = useState<ConfigFormState>(emptyConfigForm());
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  // Creating a workflow asks for the product first, so a draft can never land on
  // whichever product tab happened to be open.
  const [newConfigProductId, setNewConfigProductId] = useState("");
  const pendingBuilderConfigIdRef = useRef<string | null>(null);
  const creatingDraftRef = useRef(false);

  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [previewConfig, setPreviewConfig] = useState<WorkflowConfig | null>(null);
  const [exportMenu, setExportMenu] = useState<{ el: HTMLElement; cfg: WorkflowConfig } | null>(null);
  const [deleteConfig, setDeleteConfig] = useState<WorkflowConfig | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Archive. The backend has always supported POST /workflow-configs/{id}/archive, and
  // workflowConfigService.archive() existed — but nothing ever called it, so the app told
  // users to "archive it instead of deleting" while offering no way to do so.
  // Archived configs are hidden from the list by default (they stay retrievable via the
  // toggle) and are already excluded from asset assignment, which only offers Published.
  const [archiveConfig, setArchiveConfig] = useState<WorkflowConfig | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const [settingsMenu, setSettingsMenu] = useState<HTMLElement | null>(null);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchProducts());
    workflowTypeService.list().then(setWorkflowTypes).catch(() => {});
  }, [dispatch]);

  const products = useMemo(
    () => productsState.items,
    [productsState.items],
  );
  const productIdsKey = useMemo(() => products.map((p) => p.id).join("|"), [products]);

  useEffect(() => {
    if (tab >= products.length) setTab(Math.max(0, products.length - 1));
  }, [tab, products.length]);

  // Restore active product tab + view mode from URL (priority) or sessionStorage (fallback).
  // Read-only — do not rewrite the URL here; that races with sidebar navigation away from
  // this page when the products list refreshes (e.g. Projects page mount fetching products).
  useEffect(() => {
    if (!isActiveRoute || products.length === 0) return;

    const productIdFromUrl = searchParams.get("product");
    const viewFromUrl = searchParams.get("view");
    const configIdFromUrl = searchParams.get("config");

    let resolvedTabIdx = 0;
    if (productIdFromUrl) {
      const idx = products.findIndex((p) => p.id === productIdFromUrl);
      if (idx >= 0) resolvedTabIdx = idx;
    } else {
      try {
        const stored = sessionStorage.getItem("work_instructions_active_product_id");
        if (stored) {
          const idx = products.findIndex((p) => p.id === stored);
          if (idx >= 0) resolvedTabIdx = idx;
        }
      } catch {}
    }

    const resolvedView: "instructions" | "builder" =
      viewFromUrl === "builder" ? "builder" : "instructions";

    setTab(resolvedTabIdx);
    setViewMode(resolvedView);
    if (configIdFromUrl) setSelectedConfigId(configIdFromUrl);
  }, [isActiveRoute, products.length, productIdsKey, searchParams]);

  // One-time URL backfill so Favorites capture product/view — only when params are missing.
  useEffect(() => {
    if (!isActiveRoute || products.length === 0 || urlBackfillDoneRef.current) return;
    if (!allowUrlWritesRef.current) return;
    if (searchParams.has("product") && searchParams.has("view")) {
      urlBackfillDoneRef.current = true;
      return;
    }

    urlBackfillDoneRef.current = true;
    const productIdFromUrl = searchParams.get("product");
    const viewFromUrl = searchParams.get("view");
    const configIdFromUrl = searchParams.get("config");

    let resolvedTabIdx = 0;
    if (productIdFromUrl) {
      const idx = products.findIndex((p) => p.id === productIdFromUrl);
      if (idx >= 0) resolvedTabIdx = idx;
    }

    const resolvedView: "instructions" | "builder" =
      viewFromUrl === "builder" ? "builder" : "instructions";

    const productId = products[resolvedTabIdx]?.id;
    const params: Record<string, string> = {};
    if (productId) params.product = productId;
    params.view = resolvedView;
    if (configIdFromUrl) params.config = configIdFromUrl;
    safeSetSearchParams(params);
  }, [isActiveRoute, products.length, productIdsKey, searchParams, safeSetSearchParams]);

  const activeProduct = products[tab];
  const [workflowFeatures, setWorkflowFeatures] = useState<WorkflowFeatureDefinition[]>([]);

  useEffect(() => {
    const productId = activeProduct?.id;
    if (!productId) {
      setWorkflowFeatures([]);
      return;
    }

    let cancelled = false;
    const legacyById = new Map((activeProduct?.features ?? []).map((feature) => [feature.id, feature]));

    featureService.getByProduct(productId).then((libFeatures) => {
      if (cancelled) return;
      setWorkflowFeatures(libFeatures.map((feature) => toWorkflowFeatureDefinition(feature, legacyById.get(feature.id))));
    }).catch(() => {
      if (cancelled) return;
      setWorkflowFeatures(
        (activeProduct?.features ?? []).map((feature) => ({
          ...feature,
          isInventory: (feature as { isInventory?: boolean }).isInventory ?? false,
        })),
      );
    });

    return () => { cancelled = true; };
  }, [activeProduct]);

  // Builder feature selection is sourced from the Features library. Only inventory
  // features are installable units; non-inventory items flow through dependencies/BOM.
  const inventoryFeatures = useMemo(
    () => workflowFeatures.filter((feature) => feature.isInventory),
    [workflowFeatures],
  );

  useEffect(() => {
    // A product switch normally means "stop editing that product's config". The exception
    // is the product-first create flow, which switches tab *in order to* open a new draft.
    if (pendingBuilderConfigIdRef.current) {
      setSelectedConfigId(pendingBuilderConfigIdRef.current);
      pendingBuilderConfigIdRef.current = null;
      return;
    }
    setSelectedConfigId(null);
  }, [activeProduct?.id]);

  // workflowConfigService.listByProduct is local-first, so when the cache exists
  // the data is available essentially instantly. Showing a spinner here caused a
  // brief but unnecessary flash of empty state on every product tab switch. We
  // let the empty-state UI ("No work instructions yet…") stand in for the rare
  // first-ever-load case instead of blocking the render with a misleading
  // loading indicator.
  const loadConfigs = useCallback(async (productId: string) => {
    const data = await workflowConfigService.listByProduct(productId);
    setConfigs(data);
  }, []);

  useEffect(() => {
    if (!activeProduct?.id) { setConfigs([]); return; }
    loadConfigs(activeProduct.id);
  }, [activeProduct?.id, loadConfigs]);

  useEffect(() => {
    const configIdFromUrl = searchParams.get("config");
    if (!configIdFromUrl) return;
    if (!configs.some((cfg) => cfg.id === configIdFromUrl)) return;
    setSelectedConfigId((current) => (current === configIdFromUrl ? current : configIdFromUrl));
    setViewMode("builder");
  }, [configs, searchParams]);

  const selectedConfig = useMemo(
    () => configs.find((c) => c.id === selectedConfigId) ?? null,
    [configs, selectedConfigId],
  );

  // Roles with viewScope="own" see only Published configs (Option B).
  const canViewAllWI = (can.workInstructionsBuilder?.viewScope ?? "own") === "all";

  // Tier-2 workflow permissions. These four flags have been editable in Admin → Roles
  // since the two-tier model landed, but nothing read them — every control below gated on
  // the Tier-1 `editForms` flag instead, so unticking "publish" for a role changed nothing
  // and roles without server-side authoring rights were shown buttons that 403'd.
  const wiCan = {
    build:   !!can.workInstructionsBuilder?.build,
    publish: !!can.workInstructionsBuilder?.publish,
    archive: !!can.workInstructionsBuilder?.archive,
    delete:  !!can.workInstructionsBuilder?.delete,
  };

  // Drives the "Show archived (N)" toggle — only worth showing if any exist.
  const archivedCount = useMemo(
    () => configs.filter((c) => c.status === "Archived").length,
    [configs],
  );
  const publishedCount = useMemo(
    () => configs.filter((c) => c.status === "Published").length,
    [configs],
  );
  const draftCount = useMemo(
    () => configs.filter((c) => c.status === "Draft").length,
    [configs],
  );

  const filteredConfigs = useMemo(() => {
    const q = configSearch.trim().toLowerCase();
    const scopeFiltered = canViewAllWI ? configs : configs.filter((c) => c.status === "Published");
    // Archived configs are hidden by default — "archive" should get a workflow out of the
    // working list without destroying it. They remain reachable via the "Show archived"
    // toggle. (Users restricted to Published already never see them.)
    const archiveFiltered = showArchived
      ? scopeFiltered
      : scopeFiltered.filter((c) => c.status !== "Archived");
    const filtered = !q ? archiveFiltered : archiveFiltered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.configType ?? "").toLowerCase().includes(q) ||
        (c.notes ?? "").toLowerCase().includes(q) ||
        (c.createdBy ?? "").toLowerCase().includes(q),
    );

    const getSortValue = (config: WorkflowConfig) => {
      switch (sortBy) {
        case "name": return (config.name ?? "").toLowerCase();
        case "configType": return (config.configType ?? "").toLowerCase();
        case "createdBy": return (config.createdBy ?? "").toLowerCase();
        case "status": return (config.status ?? "").toLowerCase();
        case "dateCreated":
        default:
          return Date.parse(config.createdAt) || 0;
      }
    };

    const multiplier = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const aVal = getSortValue(a);
      const bVal = getSortValue(b);
      if (aVal < bVal) return -1 * multiplier;
      if (aVal > bVal) return 1 * multiplier;
      return 0;
    });
  }, [canViewAllWI, configs, configSearch, sortBy, sortDir, showArchived]);

  // â”€â”€â”€ Config CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function openNewConfig() {
    setEditingConfig(null);
    setConfigForm(emptyConfigForm());
    setNewConfigProductId(activeProduct?.id ?? products[0]?.id ?? "");
    setConfigError(null);
    setConfigDialogOpen(true);
  }

  function openEditConfig(cfg: WorkflowConfig) {
    setEditingConfig(cfg);
    let featureSels: FeatureSelection[] = [];
    try {
      featureSels = JSON.parse(cfg.featureSelectionsJson) as FeatureSelection[];
    } catch {}
    const selMap = new Map(featureSels.map((s) => [s.featureId, s]));
    setConfigForm({
      name: cfg.name,
      configType: cfg.configType ?? "",
      workflowTypeId:
        cfg.workflowTypeId ??
        workflowTypes.find((type) => type.name === cfg.configType)?.id ??
        "",
      notes: cfg.notes ?? "",
      featureSelections: inventoryFeatures.map(
        (f) => selMap.get(f.id) ?? { featureId: f.id, included: false, activeCount: 0 },
      ),
    });
    setConfigError(null);
    setConfigDialogOpen(true);
  }

  function closeConfigDialog() {
    setConfigDialogOpen(false);
    setEditingConfig(null);
    setConfigError(null);
  }

  async function saveConfig() {
    if (!editingConfig) return;
    const name = configForm.name.trim();
    if (!name) { setConfigError("Name is required."); return; }
    if (!configForm.workflowTypeId.trim()) {
      setConfigError("Workflow type is required.");
      return;
    }
    setConfigSaving(true);
    try {
      const selectedWorkflowType = workflowTypes.find((type) => type.id === configForm.workflowTypeId);
      const updated = await workflowConfigService.update(editingConfig.id, {
        name,
        productId: editingConfig.productId,
        notes: configForm.notes.trim() || undefined,
        configType: (selectedWorkflowType?.name ?? configForm.configType.trim()) || undefined,
        workflowTypeId: configForm.workflowTypeId || undefined,
        featureSelectionsJson: JSON.stringify(configForm.featureSelections),
      });
      setConfigs((prev) => prev.map((c) => (c.id === editingConfig.id ? updated : c)));
      closeConfigDialog();
    } catch {
      setConfigError("Failed to save. Please try again.");
    } finally {
      setConfigSaving(false);
    }
  }

  /**
   * Product-first create: the draft is named after the product and opened straight in
   * the Builder for that product. Name, type, description and installed features are
   * all set when publishing.
   */
  async function createDraftForSelectedProduct() {
    const product = products.find((p) => p.id === newConfigProductId);
    if (!product) { setConfigError("Select a product to continue."); return; }
    // The disabled state alone loses the race on a slow link: a second tap before the
    // re-render creates a second draft.
    if (creatingDraftRef.current) return;
    creatingDraftRef.current = true;
    setConfigSaving(true);
    try {
      const created = await workflowConfigService.create({
        name: product.name,
        productId: product.id,
        featureSelectionsJson: JSON.stringify([]),
      });
      const productIdx = products.findIndex((p) => p.id === product.id);
      if (productIdx >= 0 && products[tab]?.id !== product.id) {
        pendingBuilderConfigIdRef.current = created.id;
        setTab(productIdx);
      }
      setConfigs((prev) => [created, ...prev]);
      closeConfigDialog();
      openBuilder(created, product.id);
    } catch {
      setConfigError("Failed to create workflow. Please try again.");
    } finally {
      creatingDraftRef.current = false;
      setConfigSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteConfig) return;
    setDeleting(true);
    try {
      await workflowConfigService.remove(deleteConfig.id, deleteConfig.productId);
      setConfigs((prev) => prev.filter((c) => c.id !== deleteConfig.id));
      if (selectedConfigId === deleteConfig.id) setSelectedConfigId(null);
      setDeleteConfig(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Delete failed. If this workflow has existing runs, archive it instead of deleting.");
    } finally {
      setDeleting(false);
    }
  }

  async function confirmArchive() {
    if (!archiveConfig) return;
    setArchiving(true);
    try {
      const updated = await workflowConfigService.archive(archiveConfig.id);
      // Update in place rather than removing: the config still exists, it's just Archived.
      // The list filter hides it unless "Show archived" is on.
      setConfigs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (selectedConfigId === archiveConfig.id) setSelectedConfigId(null);
      setArchiveConfig(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Archive failed. Please try again.");
    } finally {
      setArchiving(false);
    }
  }

  async function handlePublish(cfg: WorkflowConfig) {
    setPublishingId(cfg.id);
    try {
      const updated = await workflowConfigService.publish(cfg.id);
      setConfigs((prev) => prev.map((c) => (c.id === cfg.id ? updated : c)));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Publish failed. Please try again.");
    } finally {
      setPublishingId(null);
    }
  }

  async function handleClone(cfg: WorkflowConfig) {
    setCloningId(cfg.id);
    try {
      const cloned = await workflowConfigService.clone(cfg.id);
      setConfigs((prev) => [cloned, ...prev]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Clone failed. Please try again.");
    } finally {
      setCloningId(null);
    }
  }

  /** productIdOverride is needed right after a tab switch, when activeProduct is still stale. */
  function openBuilder(cfg: WorkflowConfig, productIdOverride?: string) {
    // Never leave a modal mounted over the Builder: it makes the page inert and reads
    // to the user as a freeze.
    setConfigDialogOpen(false);
    setEditingConfig(null);
    setSelectedConfigId(cfg.id);
    setViewMode("builder");
    const params: Record<string, string> = { view: "builder", config: cfg.id };
    const productId = productIdOverride ?? activeProduct?.id;
    if (productId) params.product = productId;
    safeSetSearchParams(params);
  }

  function handleConfigSaved(updated: WorkflowConfig) {
    setConfigs((prev) => {
      const exists = prev.some((c) => c.id === updated.id);
      return exists ? prev.map((c) => (c.id === updated.id ? updated : c)) : [updated, ...prev];
    });
  }

  function handleConfigPublished(updated: WorkflowConfig) {
    setConfigs((prev) => {
      const exists = prev.some((c) => c.id === updated.id);
      return exists ? prev.map((c) => (c.id === updated.id ? updated : c)) : [updated, ...prev];
    });
    setSelectedConfigId(updated.id);
    setViewMode("instructions");
    const params: Record<string, string> = { view: "instructions" };
    if (activeProduct?.id) params.product = activeProduct.id;
    safeSetSearchParams(params);
  }

  function handleBuilderCancel(deletedConfigId?: string) {
    if (deletedConfigId) {
      setConfigs((prev) => prev.filter((c) => c.id !== deletedConfigId));
    }
    setSelectedConfigId(null);
    setViewMode("instructions");
    const params: Record<string, string> = { view: "instructions" };
    if (activeProduct?.id) params.product = activeProduct.id;
    safeSetSearchParams(params);
  }

  // ─── Render ───

  return (
    <Stack spacing={3}>
      <Box className="glass-card" sx={{ p: { xs: 1.5, sm: 2 }, background: "linear-gradient(135deg, rgba(8,18,24,0.98), rgba(12,28,36,0.94))" }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems="center" gap={2}>
        <Box>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
            Workflows
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create and manage workflows by product.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            size="small"
            onChange={(_, next) => {
              if (next) {
                setViewMode(next);
                const productId = products[tab]?.id;
                const params: Record<string, string> = {};
                if (productId) params.product = productId;
                params.view = next;
                safeSetSearchParams(params);
              }
            }}
          >
            <ToggleButton value="instructions">
              <FormatListBulletedOutlined fontSize="small" sx={{ mr: 0.75 }} />
              List
            </ToggleButton>
            {wiCan.build && (
              <ToggleButton value="builder">
                <BuildOutlined fontSize="small" sx={{ mr: 0.75 }} />
                Builder
              </ToggleButton>
            )}
          </ToggleButtonGroup>
        </Stack>
      </Stack>
      <Box
        sx={{
          mt: 1.75,
          display: "grid",
          gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))" },
          gap: 1,
        }}
      >
        <Box sx={{ borderRadius: 2.5, p: 1.25, bgcolor: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.18)" }}>
          <Typography variant="caption" sx={{ color: "rgba(153,246,228,0.84)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Published
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.25 }}>{publishedCount}</Typography>
        </Box>
        <Box sx={{ borderRadius: 2.5, p: 1.25, bgcolor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
          <Typography variant="caption" sx={{ color: "rgba(253,224,71,0.88)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Drafts
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.25 }}>{draftCount}</Typography>
        </Box>
        <Box sx={{ borderRadius: 2.5, p: 1.25, bgcolor: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.18)" }}>
          <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.82)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Archived
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.25 }}>{archivedCount}</Typography>
        </Box>
      </Box>
      </Box>

      {/* Product tabs */}
      <Paper className="glass-card" sx={{ p: 1.5 }}>
        <Tabs
          value={tab}
          onChange={(_, next) => {
            setTab(next);
            setViewMode("instructions");
            const productId = products[next]?.id ?? "";
            try { sessionStorage.setItem("work_instructions_active_product_id", productId); } catch {}
            const params: Record<string, string> = {};
            if (productId) params.product = productId;
            params.view = "instructions";
            safeSetSearchParams(params);
          }}
          variant="scrollable"
          allowScrollButtonsMobile
          scrollButtons="auto"
        >
          {products.map((product) => (
            <Tab key={product.id} label={product.name} />
          ))}
        </Tabs>
      </Paper>

      {/* â”€â”€ Instructions table view â”€â”€ */}
      {viewMode === "instructions" && (
        <Paper className="glass-card" sx={{ p: 2.5 }}>
          {!activeProduct ? (
            <Typography color="text.secondary">
              No products found. Create a product in Settings to generate tabs here.
            </Typography>
          ) : (
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }} sx={{ width: "100%" }}>
                  <TextField
                    size="small"
                    placeholder="Search workflows…"
                    value={configSearch}
                    onChange={(e) => setConfigSearch(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchOutlined fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ maxWidth: 360, width: "100%" }}
                  />
                  <FormControl size="small" sx={{ minWidth: 170 }}>
                    <InputLabel shrink>Sort By</InputLabel>
                    <Select label="Sort By" value={sortBy} onChange={(e) => setSortBy(e.target.value as WorkInstructionSortKey)}>
                      <MenuItem value="dateCreated">Date Created</MenuItem>
                      <MenuItem value="name">Name</MenuItem>
                      <MenuItem value="configType">Configuration Type</MenuItem>
                      <MenuItem value="createdBy">Created By</MenuItem>
                      <MenuItem value="status">Status</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel shrink>Order</InputLabel>
                    <Select label="Order" value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}>
                      <MenuItem value="asc">Ascending</MenuItem>
                      <MenuItem value="desc">Descending</MenuItem>
                    </Select>
                  </FormControl>
                  {/* Archived configs are hidden by default; this reveals them. Only shown
                      to users who can actually see non-Published configs. */}
                  {canViewAllWI && archivedCount > 0 && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={showArchived}
                          onChange={(e) => setShowArchived(e.target.checked)}
                        />
                      }
                      label={<Typography variant="body2">Show archived ({archivedCount})</Typography>}
                      sx={{ whiteSpace: "nowrap" }}
                    />
                  )}
                </Stack>
                {wiCan.build && (
                  <Button variant="contained" size="small" onClick={openNewConfig}>
                    + New Workflow
                  </Button>
                )}
              </Stack>

              {filteredConfigs.length === 0 ? (
                <Alert severity="info">
                  {configs.length === 0
                    ? `No workflows yet for ${activeProduct.name}. Click "+ New Workflow" to create one.`
                    : "No workflows match the search."}
                </Alert>
              ) : isPhone ? (
                <Stack spacing={1.25}>
                  {filteredConfigs.map((cfg) => (
                    <Box
                      key={cfg.id}
                      sx={{
                        p: 1.5,
                        borderRadius: 3,
                        border: "1px solid rgba(148,163,184,0.12)",
                        background: "linear-gradient(180deg, rgba(10,18,24,0.94), rgba(8,14,19,0.98))",
                      }}
                    >
                      <Stack spacing={1.1}>
                        <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body1" fontWeight={700} className="line-clamp-2">
                              {cfg.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" className="line-clamp-2">
                              {cfg.notes || cfg.configType || "No description"}
                            </Typography>
                          </Box>
                          <Stack alignItems="flex-end" spacing={0.5}>
                            <StatusChip status={cfg.status} />
                            <Chip size="small" label={`v${cfg.version}`} variant="outlined" />
                          </Stack>
                        </Stack>

                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 0.75 }}>
                          <Box sx={{ borderRadius: 2, p: 1, bgcolor: "rgba(255,255,255,0.03)" }}>
                            <Typography variant="caption" color="text.secondary">Type</Typography>
                            <Typography variant="body2" fontWeight={600} className="line-clamp-1">
                              {cfg.configType || "—"}
                            </Typography>
                          </Box>
                          <Box sx={{ borderRadius: 2, p: 1, bgcolor: "rgba(255,255,255,0.03)" }}>
                            <Typography variant="caption" color="text.secondary">By</Typography>
                            <Typography variant="body2" fontWeight={600} className="line-clamp-1">
                              {cfg.createdBy || "—"}
                            </Typography>
                          </Box>
                          <Box sx={{ borderRadius: 2, p: 1, bgcolor: "rgba(255,255,255,0.03)" }}>
                            <Typography variant="caption" color="text.secondary">Date</Typography>
                            <Typography variant="body2" fontWeight={600}>
                              {formatDate(cfg.createdAt)}
                            </Typography>
                          </Box>
                        </Box>

                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                          <Button size="small" variant="contained" onClick={() => setPreviewConfig(cfg)}>
                            Preview
                          </Button>
                          {!can.viewOnly && (
                            <Button size="small" variant="outlined" onClick={(e) => setExportMenu({ el: e.currentTarget, cfg })}>
                              Export
                            </Button>
                          )}
                          {wiCan.build && (
                            <Button size="small" variant="outlined" onClick={() => openBuilder(cfg)}>
                              Builder
                            </Button>
                          )}
                          {wiCan.build && cfg.status === "Draft" && (
                            <Button size="small" variant="outlined" onClick={() => openEditConfig(cfg)}>
                              Details
                            </Button>
                          )}
                          {wiCan.archive && cfg.status !== "Archived" && (
                            <Button size="small" variant="outlined" onClick={() => setArchiveConfig(cfg)}>
                              Archive
                            </Button>
                          )}
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Configuration Type</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Created By</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Date Created</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredConfigs.map((cfg) => (
                      <TableRow key={cfg.id} hover>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography variant="body2" fontWeight={500}>{cfg.name}</Typography>
                            <StatusChip status={cfg.status} />
                            <Chip size="small" label={`v${cfg.version}`} variant="outlined" />
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{cfg.configType || "—"}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{activeProduct.name}</Typography>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 220 }}>
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {cfg.notes || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{cfg.createdBy || "—"}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{formatDate(cfg.createdAt)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.25} justifyContent="flex-end" alignItems="center">
                            {/* New version — Published/Archived */}
                            {wiCan.build && (cfg.status === "Published" || cfg.status === "Archived") && (
                              <Tooltip title="Create new version (Draft)">
                                <span>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleClone(cfg)}
                                    disabled={cloningId === cfg.id}
                                  >
                                    {cloningId === cfg.id
                                      ? <CircularProgress size={14} />
                                      : <ContentCopyOutlined fontSize="small" />}
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
                            <Tooltip title="Preview workflow">
                              <IconButton size="small" onClick={() => setPreviewConfig(cfg)}>
                                <ArticleOutlined fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {!can.viewOnly && (
                              <Tooltip title="Export">
                                <IconButton size="small" onClick={(e) => setExportMenu({ el: e.currentTarget, cfg })}>
                                  <DownloadOutlined fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {wiCan.build && (
                              <Tooltip title={cfg.status === "Published" ? "View in Builder (read-only)" : "Open Builder"}>
                                <IconButton size="small" color="primary" onClick={() => openBuilder(cfg)}>
                                  <BuildOutlined fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {wiCan.build && cfg.status === "Draft" && (
                              <Tooltip title="Edit details">
                                <IconButton size="small" onClick={() => openEditConfig(cfg)}>
                                  <SettingsOutlined fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {/* Archive — the alternative the delete error tells users to use.
                                Hidden for configs that are already Archived. A config with
                                runs cannot be deleted (the server refuses, to avoid
                                orphaning run history), so this is the correct way to retire
                                a workflow: it stays in the database and out of the working
                                list, and the assign dialog only offers Published configs so
                                it can no longer be assigned to new assets. */}
                            {wiCan.archive && cfg.status !== "Archived" && (
                              <Tooltip title="Archive (retire this workflow)">
                                <IconButton size="small" onClick={() => setArchiveConfig(cfg)}>
                                  <ArchiveOutlined fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {wiCan.delete && (
                              <Tooltip title="Delete">
                                <IconButton size="small" color="error" onClick={() => setDeleteConfig(cfg)}>
                                  <DeleteOutline fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Stack>
          )}
        </Paper>
      )}

      {/* â”€â”€ Builder view â”€â”€ */}
      {viewMode === "builder" && activeProduct && (
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Button
              size="small"
              startIcon={<ArrowBackOutlined />}
              onClick={() => setViewMode("instructions")}
            >
              Back to Instructions
            </Button>
            {selectedConfig && (
              <>
                <Typography variant="body2" color="text.secondary">
                  / {selectedConfig.name}
                </Typography>
                <StatusChip status={selectedConfig.status} />
                <Chip size="small" label={`v${selectedConfig.version}`} variant="outlined" />
              </>
            )}
          </Stack>
          <Suspense fallback={<Box sx={{ py: 6, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>}>
          <WorkflowBuilder
            productId={activeProduct.id}
            productName={activeProduct.name}
            productFeatures={inventoryFeatures}
            initialConfigId={selectedConfig?.id ?? null}
            configName={selectedConfig?.name}
            onConfigSaved={handleConfigSaved}
            onConfigPublished={handleConfigPublished}
            onNewConfig={openNewConfig}
            onCancel={handleBuilderCancel}
          />
          </Suspense>
        </Stack>
      )}

      {/* Export dropdown */}
      <Menu
        open={Boolean(exportMenu)}
        anchorEl={exportMenu?.el}
        onClose={() => setExportMenu(null)}
      >
        <MenuItem
          onClick={() => {
            if (!exportMenu) return;
            downloadJson(exportMenu.cfg, activeProduct?.name ?? "");
            setExportMenu(null);
          }}
        >
          <ListItemIcon><DownloadOutlined fontSize="small" /></ListItemIcon>
          Download JSON
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!exportMenu) return;
            printPdf(exportMenu.cfg, activeProduct?.name ?? "");
            setExportMenu(null);
          }}
        >
          <ListItemIcon><ArticleOutlined fontSize="small" /></ListItemIcon>
          Export PDF
        </MenuItem>
      </Menu>

      {/* Preview modal */}
      {previewConfig && (
        <PreviewDialog
          open
          cfg={previewConfig}
          productName={activeProduct?.name ?? ""}
          onClose={() => setPreviewConfig(null)}
        />
      )}

      {/* Workflow create/edit dialog */}
      <Dialog
        open={configDialogOpen}
        onClose={() => !configSaving && closeConfigDialog()}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingConfig ? "Edit Workflow" : "New Workflow"}</DialogTitle>
        <DialogContent>
          {!editingConfig ? (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="info" sx={{ fontSize: "0.8rem" }}>
                Choose the product this workflow belongs to. The Builder opens for that product and
                the draft is named after it — you can rename it when publishing (e.g. AIM-100 Rev 1).
              </Alert>
              {/* Native select on purpose: a portalled MUI menu renders above the dialog and,
                  opened over the Builder, looked like a stray floating list with the dialog
                  hidden behind it — reported as the Builder freezing. */}
              <TextField
                select
                fullWidth
                label="Select Product"
                value={products.some((p) => p.id === newConfigProductId) ? newConfigProductId : ""}
                onChange={(e) => {
                  setNewConfigProductId(e.target.value);
                  setConfigError(null);
                }}
                SelectProps={{ native: true }}
                InputLabelProps={{ shrink: true }}
                disabled={configSaving || products.length === 0}
                helperText={
                  products.length
                    ? "The Builder opens for this product."
                    : "No products available — add one in Settings first."
                }
              >
                <option value="">Select a product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </TextField>
              {configError && (
                <Typography variant="body2" color="error">{configError}</Typography>
              )}
            </Stack>
          ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Workflow Name"
              value={configForm.name}
              onChange={(e) => setConfigForm((p) => ({ ...p, name: e.target.value }))}
              fullWidth
              required
              autoFocus
              placeholder="e.g. AIM-100 Front Camera Install"
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth required>
              <InputLabel shrink>Workflow Type *</InputLabel>
              <Select
                label="Workflow Type *"
                value={configForm.workflowTypeId}
                onChange={(e) => {
                  const workflowTypeId = e.target.value;
                  const selected = workflowTypes.find((type) => type.id === workflowTypeId);
                  setConfigForm((p) => ({
                    ...p,
                    workflowTypeId,
                    configType: selected?.name ?? p.configType,
                  }));
                }}
              >
                <MenuItem value="" disabled>
                  Select type…
                </MenuItem>
                {workflowTypes.filter((type) => type.isActive).map((type) => (
                  <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Description"
              value={configForm.notes}
              onChange={(e) => setConfigForm((p) => ({ ...p, notes: e.target.value }))}
              fullWidth
              multiline
              rows={2}
              placeholder="Optional description or notes"
              InputLabelProps={{ shrink: true }}
            />
            {inventoryFeatures.length > 0 && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Installed Features</Typography>
                <Typography variant="caption" color="text.secondary">
                  Set how many of each feature are installed. 0 = not included.
                </Typography>
                {inventoryFeatures.map((feat) => {
                  const sel = configForm.featureSelections.find((s) => s.featureId === feat.id);
                  const count = sel?.activeCount ?? 0;
                  const setCount = (n: number) =>
                    setConfigForm((p) => ({
                      ...p,
                      featureSelections: p.featureSelections.map((s) =>
                        s.featureId === feat.id ? { ...s, activeCount: Math.max(0, n), included: n > 0 } : s,
                      ),
                    }));
                  return (
                    <Stack key={feat.id} direction="row" alignItems="center" spacing={1}>
                      <Typography variant="body2" sx={{ flex: 1 }}>{feat.name}</Typography>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <IconButton size="small" onClick={() => setCount(count - 1)} disabled={count === 0}>
                          <RemoveOutlined fontSize="small" />
                        </IconButton>
                        <Typography variant="body2" sx={{ minWidth: 24, textAlign: "center", color: count > 0 ? "primary.main" : "text.disabled", fontWeight: 600 }}>
                          {count}
                        </Typography>
                        <IconButton size="small" onClick={() => setCount(count + 1)}>
                          <AddOutlined fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>
                  );
                })}
              </Stack>
            )}
            {configError && (
              <Typography variant="body2" color="error">{configError}</Typography>
            )}
          </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfigDialog} disabled={configSaving}>Cancel</Button>
          {editingConfig ? (
            <Button variant="contained" onClick={saveConfig} disabled={configSaving || !configForm.workflowTypeId.trim()}>
              {configSaving ? "Saving…" : "Save Changes"}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={createDraftForSelectedProduct}
              disabled={configSaving || !newConfigProductId}
              startIcon={configSaving ? <CircularProgress size={14} /> : undefined}
            >
              {configSaving ? "Opening Builder…" : "Continue"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={Boolean(deleteConfig)}
        onClose={() => !deleting && setDeleteConfig(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Workflow?</DialogTitle>
        <DialogContent>
          {deleteConfig?.status === "Published" && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              This instruction is <strong>Published</strong> and may be assigned to assets. Deleting it will fail if any workflow runs reference it — use <strong>Archive</strong> instead to retire it without losing run history.
            </Alert>
          )}
          <Typography>
            Delete <strong>{deleteConfig?.name}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfig(null)} disabled={deleting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(archiveConfig)}
        onClose={() => !archiving && setArchiveConfig(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Archive Workflow?</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 1.5 }}>
            Archiving keeps the workflow and all its run history, but retires it: it can no longer be assigned to new assets, and it's hidden from this list unless you tick <strong>Show archived</strong>. Existing runs are unaffected.
          </Alert>
          <Typography>
            Archive <strong>{archiveConfig?.name}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveConfig(null)} disabled={archiving}>Cancel</Button>
          <Button variant="contained" onClick={confirmArchive} disabled={archiving}>
            {archiving ? "Archiving…" : "Archive"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default WorkInstructions;
