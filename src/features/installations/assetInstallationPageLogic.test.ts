import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowType } from "../../types/workflowType";
import {
  assetHasConfiguredWorkflow,
  computeHealth,
  DEFAULT_COL_ORDER,
  FORCE_VISIBLE_COL_IDS,
  loadColumnConfig,
  LS_COL_KEY,
  nextDraftConfigNumber,
  operationsStickyPrefixSx,
  persistColumnConfig,
  projectHasInspection,
  reorderColumnIds,
  resolveConfigWorkflowTypeId,
  resolveVisibleColumns,
  tabDotColor,
  timeAgo,
  toggleColumnHidden,
  workflowTypeMismatchMessage,
} from "./assetInstallationPageLogic";

vi.mock("../../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => false),
  isDesktopLikePlatform: vi.fn(() => true),
}));

import { isMobileNativePlatform } from "../../utils/platform";

function asset(overrides: Partial<ProjectAsset> = {}): ProjectAsset {
  return {
    id: "asset-1",
    projectId: "project-1",
    productId: "product-1",
    assetTag: "TAG-001",
    assetName: "Asset",
    status: "InProgress",
    ...overrides,
  } as ProjectAsset;
}

describe("resolveConfigWorkflowTypeId", () => {
  const types = [
    { id: "type-install", name: "Installation", sortOrder: 1, isActive: true },
    { id: "type-inspection", name: "Inspection", sortOrder: 2, isActive: true },
  ] as WorkflowType[];

  it("prefers explicit workflowTypeId on the config", () => {
    const config = {
      id: "cfg-1",
      productId: "prod-1",
      name: "Config",
      status: "Published",
      version: 1,
      workflowTypeId: "explicit-id",
      configType: "Installation",
    } as WorkflowConfig;
    expect(resolveConfigWorkflowTypeId(config, types)).toBe("explicit-id");
  });

  it("matches workflow type by configType name when FK is absent", () => {
    const config = {
      id: "cfg-2",
      productId: "prod-1",
      name: "Config",
      status: "Published",
      version: 1,
      configType: " Inspection ",
    } as WorkflowConfig;
    expect(resolveConfigWorkflowTypeId(config, types)).toBe("type-inspection");
  });

  it("returns empty string when configType is missing and FK is absent", () => {
    const config = {
      id: "cfg-3",
      productId: "prod-1",
      name: "Config",
      status: "Published",
      version: 1,
      configType: null,
    } as unknown as WorkflowConfig;
    expect(resolveConfigWorkflowTypeId(config, types)).toBe("");
  });
});

describe("workflowTypeMismatchMessage", () => {
  it("warns when inspection workflow type is paired with non-inspection config", () => {
    const msg = workflowTypeMismatchMessage("Site Inspection", "Installation");
    expect(msg).toContain("installation/generic type");
    expect(msg).toContain("Site Inspection");
  });

  it("warns when inspection config is paired with non-inspection workflow type", () => {
    const msg = workflowTypeMismatchMessage("Installation", "wftype-inspection");
    expect(msg).toContain("inspection type");
    expect(msg).toContain("Installation");
  });

  it("returns null when types align", () => {
    expect(workflowTypeMismatchMessage("Inspection", "inspection")).toBeNull();
    expect(workflowTypeMismatchMessage("Installation", "Installation")).toBeNull();
  });
});

describe("projectHasInspection", () => {
  it("is true for inspection-only and mixed project modes", () => {
    expect(projectHasInspection("INSPECTION_ONLY")).toBe(true);
    expect(projectHasInspection("MIXED")).toBe(true);
  });

  it("is false for installation-only and empty modes", () => {
    expect(projectHasInspection("INSTALLATION_ONLY")).toBe(false);
    expect(projectHasInspection(null)).toBe(false);
    expect(projectHasInspection(undefined)).toBe(false);
  });
});

describe("assetHasConfiguredWorkflow and computeHealth", () => {
  it("counts assets without workflow sources as noWorkflow", () => {
    const list = [
      asset({ status: "NotStarted" }),
      asset({
        status: "InProgress",
        workflowSummary: { hasWorkflow: true } as ProjectAsset["workflowSummary"],
      }),
      asset({ status: "Issue", productConfigId: "cfg-1" }),
    ];
    const health = computeHealth(list);
    expect(health.total).toBe(3);
    expect(health.noWorkflow).toBe(1);
    expect(health.inProgress).toBe(1);
    expect(health.issue).toBe(1);
  });

  it("detects configured workflow from summary, product config, or template id", () => {
    expect(assetHasConfiguredWorkflow(asset())).toBe(false);
    expect(
      assetHasConfiguredWorkflow(asset({ workflowSummary: { hasWorkflow: true } as ProjectAsset["workflowSummary"] })),
    ).toBe(true);
    expect(assetHasConfiguredWorkflow(asset({ productConfigId: "pc-1" }))).toBe(true);
    expect(assetHasConfiguredWorkflow(asset({ workflowTemplateId: "tpl-1" }))).toBe(true);
  });
});

describe("tabDotColor", () => {
  it("returns null for empty health", () => {
    expect(tabDotColor(undefined)).toBeNull();
    expect(tabDotColor({ total: 0 } as ReturnType<typeof computeHealth>)).toBeNull();
  });

  it("prioritises issue over complete", () => {
    expect(
      tabDotColor({
        total: 2,
        issue: 1,
        complete: 1,
        closed: 0,
      } as ReturnType<typeof computeHealth>),
    ).toBe("error.main");
  });

  it("shows success when every asset is complete or closed", () => {
    expect(
      tabDotColor({
        total: 3,
        issue: 0,
        complete: 2,
        closed: 1,
      } as ReturnType<typeof computeHealth>),
    ).toBe("success.main");
  });

  it("shows warning for in-progress portfolios", () => {
    expect(
      tabDotColor({
        total: 2,
        issue: 0,
        complete: 0,
        closed: 0,
        inProgress: 2,
      } as ReturnType<typeof computeHealth>),
    ).toBe("warning.main");
  });
});

describe("nextDraftConfigNumber", () => {
  it("increments the highest matching draft config suffix for a product", () => {
    const configs = [
      { name: "Widget Config 2" },
      { name: "Widget Config 10" },
      { name: "Other Config 99" },
    ] as WorkflowConfig[];
    expect(nextDraftConfigNumber(configs, "Widget")).toBe(11);
  });

  it("starts at 1 when no prior configs exist", () => {
    expect(nextDraftConfigNumber([], "Widget")).toBe(1);
  });
});

describe("loadColumnConfig", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("returns defaults when localStorage is empty", () => {
    expect(loadColumnConfig()).toEqual({ order: DEFAULT_COL_ORDER, hidden: [] });
  });

  it("merges saved order with newly added columns and strips unknown ids", () => {
    localStorage.setItem(
      LS_COL_KEY,
      JSON.stringify({
        order: ["assetName", "unknown-col", "status"],
        hidden: ["location", "bogus", ...FORCE_VISIBLE_COL_IDS],
      }),
    );
    const config = loadColumnConfig();
    expect(config.order[0]).toBe("assetName");
    expect(config.order).toContain("status");
    expect(config.order).not.toContain("unknown-col");
    expect(config.order.length).toBe(DEFAULT_COL_ORDER.length);
    expect(config.hidden).toEqual(["location"]);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-08-17T10:00:00.000Z");

  it("formats recent timestamps", () => {
    expect(timeAgo(new Date(now - 30_000), now)).toBe("just now");
    expect(timeAgo(new Date(now - 120_000), now)).toBe("2 min ago");
    expect(timeAgo(new Date(now - 7_200_000), now)).toBe("2h ago");
  });
});

describe("resolveVisibleColumns", () => {
  it("returns archive column set in archive mode", () => {
    const cols = resolveVisibleColumns({ order: DEFAULT_COL_ORDER, hidden: [] }, true);
    expect(cols.map((c) => c.id)).toEqual([
      "serialNumber",
      "assetModel",
      "manufacturer",
      "project",
      "siteName",
      "configType",
      "status",
    ]);
  });

  it("filters hidden columns in normal mode", () => {
    const cols = resolveVisibleColumns(
      { order: DEFAULT_COL_ORDER, hidden: ["location", "features"] },
      false,
    );
    expect(cols.map((c) => c.id)).not.toContain("location");
    expect(cols.map((c) => c.id)).not.toContain("features");
    expect(cols.map((c) => c.id)).toContain("assetName");
  });
});

describe("reorderColumnIds and toggleColumnHidden", () => {
  it("moves a column id within the order array", () => {
    expect(reorderColumnIds(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(reorderColumnIds(["a", "b", "c"], 0, 0)).toEqual(["a", "b", "c"]);
  });

  it("adds and removes hidden column ids", () => {
    expect(toggleColumnHidden(["location"], "features", false)).toEqual(["location", "features"]);
    expect(toggleColumnHidden(["location", "features"], "location", true)).toEqual(["features"]);
  });
});

describe("persistColumnConfig", () => {
  afterEach(() => {
    localStorage.removeItem(LS_COL_KEY);
  });

  it("writes column config to localStorage", () => {
    persistColumnConfig({ order: ["assetName", "status"], hidden: ["location"] });
    expect(JSON.parse(localStorage.getItem(LS_COL_KEY)!)).toEqual({
      order: ["assetName", "status"],
      hidden: ["location"],
    });
    expect(loadColumnConfig().hidden).toEqual(["location"]);
  });
});

describe("operationsStickyPrefixSx", () => {
  it("returns sticky styles on non-native platforms", () => {
    vi.mocked(isMobileNativePlatform).mockReturnValue(false);
    expect(operationsStickyPrefixSx(40, 3)).toMatchObject({
      position: "sticky",
      left: 40,
      zIndex: 3,
    });
  });

  it("returns empty object on native platforms", () => {
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
    expect(operationsStickyPrefixSx(40, 3)).toEqual({});
  });
});
