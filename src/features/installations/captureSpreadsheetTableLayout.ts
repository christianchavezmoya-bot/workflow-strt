import type { ProjectCaptureGroup } from "../../utils/projectCaptureTable";
import type { ProjectAsset } from "../../types/projectAsset";

export type CaptureSpreadsheetAssetJobColumn = {
  id: string;
  label: string;
  valueFor: (asset: ProjectAsset) => string;
};

export const CHECKBOX_W = 40;
export const TAG_W = 98;
export const ASSET_JOB_COL_W = 118;
export const CAPTURE_COL_W = 104;
export const STATUS_W = 112;
export const ACTIONS_W = 132;

export const HEADER_Z = {
  corner: 120,
  row1: 115,
  row2: 110,
  row3: 105,
  bodyStickyLeft: 5,
} as const;

export const STATIC_HEADER_BG = "#1F4E78";
export const STATIC_HEADER_TEXT = "#F4FBFF";
export const STATIC_HEADER_BORDER = "#4F6F8B";

export const ASSET_JOB_PALETTE = {
  header: "#224F88",
  subHeader: "#E6EEF8",
  border: "#224F88",
  tint: "#F7FAFD",
  tintAlt: "#EFF5FB",
  text: "#163447",
};

/** Cells for capture fields not present on this asset's workflow run. */
export const NA_CELL_BG = "#E3F2FD";
export const NA_CELL_TEXT = "rgba(22, 52, 71, 0.58)";

/** Shared typography for asset-tag cells and column header labels (row 1 + row 3). */
export const CAPTURE_FIELD_HEADER_FONT = {
  fontSize: 12,
  lineHeight: 1.2,
  fontWeight: 700,
  fontFamily: "Manrope, Sora, system-ui, sans-serif",
} as const;

export const ROW_HOVER_BG = "rgba(255,255,255,0.985)";
export const CELL_HOVER_BORDER = "rgba(34,79,136,0.32)";

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const n = Number.parseInt(value, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function groupPalette(group: ProjectCaptureGroup) {
  if (group.groupType === "general") {
    return {
      header: "#5B6576",
      subHeader: "#EEF1F5",
      border: "#5B6576",
      tint: hexToRgba("#5B6576", 0.07),
    };
  }

  const featurePalettes = [
    { header: "#1F4E78", subHeader: "#E7F0F8", border: "#1F4E78", tint: hexToRgba("#1F4E78", 0.08) },
    { header: "#1D6F68", subHeader: "#E5F4F1", border: "#1D6F68", tint: hexToRgba("#1D6F68", 0.085) },
    { header: "#556B7B", subHeader: "#EDF1F4", border: "#556B7B", tint: hexToRgba("#556B7B", 0.08) },
    { header: "#8A6B2D", subHeader: "#F8F1E2", border: "#8A6B2D", tint: hexToRgba("#8A6B2D", 0.08) },
  ];

  return featurePalettes[Math.abs(group.tintIndex) % featurePalettes.length];
}

export function bodyCellHoverSx(rowBg: string) {
  return {
    bgcolor: rowBg,
    transition: "background-color 120ms ease, box-shadow 120ms ease",
    "&:hover": {
      bgcolor: `${ROW_HOVER_BG} !important`,
      boxShadow: `inset 0 0 0 2px ${CELL_HOVER_BORDER}`,
    },
  } as const;
}

export function stickyCell(left: number, width: number, zIndex: number, rowBg?: string) {
  return {
    position: "sticky" as const,
    left,
    zIndex,
    minWidth: width,
    width,
    maxWidth: width,
    bgcolor: rowBg ?? ASSET_JOB_PALETTE.tint,
  };
}

export const CAPTURE_ROW_HEIGHT = 38;
/** Virtualize the body when at least this many filtered rows are visible. */
export const CAPTURE_VIRTUALIZE_MIN_ROWS = 20;

export function captureCellKey(assetId: string, columnId: string) {
  return `${assetId}::${columnId}`;
}
