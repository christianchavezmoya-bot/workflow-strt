import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { projectAssetService } from "../../services/projectAssetService";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { featureService } from "../../services/featureService";
import { featureDependencyService } from "../../services/featureDependencyService";
import { workflowConfigService } from "../../services/workflowConfigService";
import { computeMaxUnitsByFeature } from "../../utils/captureSpreadsheet";
import type { FeatureSelection } from "../../services/productConfigService";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { Feature as LibFeature } from "../../types/feature";
import type { FeatureDependency } from "../../types/featureDependency";
import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";

/**
 * Loads everything the capture matrix needs for one project, for the standalone capture
 * route. AssetInstallationPage keeps its own copy of this because it interleaves the data
 * with operations-view concerns; this hook deliberately loads only what the read-only
 * matrix renders.
 *
 * Run blobs are requested in bounded chunks. The whole point of this view is to see an entire
 * job at once, and asking for full StepResultsJson / WorkflowSnapshotJson for 150+ assets in
 * a single response is exactly the payload that used to stall the assets page.
 */
const RUN_DETAIL_CHUNK_SIZE = 50;

export interface ProjectCaptureData {
  assets: ProjectAsset[];
  runsMap: Record<string, AssetWorkflowRun[]>;
  features: LibFeature[];
  depsByFeature: Record<string, FeatureDependency[]>;
  featureSelectionsByConfig: FeatureSelection[][];
  maxUnitsByFeature: Record<string, number>;
  activeCountForAsset: (asset: ProjectAsset) => Record<string, number>;
  loading: boolean;
  runsLoading: boolean;
  error: string | null;
  applyRunUpdate: (run: AssetWorkflowRun) => void;
  reload: () => void;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function useProjectCaptureData(projectId: string, productId?: string): ProjectCaptureData {
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [runsMap, setRunsMap] = useState<Record<string, AssetWorkflowRun[]>>({});
  const [features, setFeatures] = useState<LibFeature[]>([]);
  const [depsByFeature, setDepsByFeature] = useState<Record<string, FeatureDependency[]>>({});
  const [publishedConfigs, setPublishedConfigs] = useState<WorkflowConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Same guards as the assets page: a completed/in-flight key per project+asset-set, so a
  // re-render can never re-issue the runs-detail fetch. Depending on runsMap here is what
  // caused a refetch every ~3s on the assets page, so this effect must never read it.
  const runsDoneKeyRef = useRef<string | null>(null);
  const runsInflightKeyRef = useRef<string | null>(null);

  const assetsKey = useMemo(
    () => assets.map((a) => a.id).sort().join("|"),
    [assets],
  );

  useEffect(() => {
    runsDoneKeyRef.current = null;
    runsInflightKeyRef.current = null;
  }, [projectId]);

  // ── Assets ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) {
      setAssets([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    projectAssetService.listByProject(projectId)
      .then((rows) => {
        if (cancelled) return;
        setAssets(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setAssets([]);
        setError("Could not load assets for this project. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [projectId, reloadTick]);

  // ── Run blobs (capture values live in stepResultsJson) ────────────────────
  useEffect(() => {
    if (!projectId || assetsKey === "") {
      setRunsLoading(false);
      return;
    }

    const fetchKey = `${projectId}:${assetsKey}`;
    if (runsDoneKeyRef.current === fetchKey || runsInflightKeyRef.current === fetchKey) return;

    let cancelled = false;
    runsInflightKeyRef.current = fetchKey;
    setRunsLoading(true);

    const assetIds = assetsKey.split("|");
    void Promise.all(
      chunk(assetIds, RUN_DETAIL_CHUNK_SIZE).map((ids) =>
        assetWorkflowRunService.loadRunDetailsForAssets(projectId, ids).catch(() => [] as AssetWorkflowRun[]),
      ),
    )
      .then((batches) => {
        if (cancelled) return;
        const next: Record<string, AssetWorkflowRun[]> = {};
        for (const run of batches.flat()) {
          (next[run.assetId] ??= []).push(run);
        }
        setRunsMap(next);
        runsDoneKeyRef.current = fetchKey;
      })
      .finally(() => {
        runsInflightKeyRef.current = null;
        if (!cancelled) setRunsLoading(false);
      });

    return () => { cancelled = true; };
  }, [assetsKey, projectId]);

  // ── Feature catalogue for capture columns ─────────────────────────────────
  useEffect(() => {
    if (!productId) {
      setFeatures([]);
      setDepsByFeature({});
      setPublishedConfigs([]);
      return;
    }
    let cancelled = false;

    featureService.getByProduct(productId)
      .then((feats) => {
        if (cancelled) return;
        // Render columns as soon as features land; dependencies only enrich the metadata.
        setFeatures(feats);
        void featureDependencyService.mapByProduct(productId)
          .then((map) => {
            if (cancelled) return;
            const complete: Record<string, FeatureDependency[]> = {};
            for (const f of feats) complete[f.id] = map[f.id] ?? [];
            setDepsByFeature(complete);
          })
          .catch(() => { if (!cancelled) setDepsByFeature({}); });
      })
      .catch(() => {
        if (cancelled) return;
        setFeatures([]);
        setDepsByFeature({});
      });

    workflowConfigService.listByProduct(productId, "Published")
      .then((configs) => { if (!cancelled) setPublishedConfigs(configs); })
      .catch(() => { if (!cancelled) setPublishedConfigs([]); });

    return () => { cancelled = true; };
  }, [productId]);

  const featureSelectionsByConfig = useMemo((): FeatureSelection[][] => (
    publishedConfigs.map((c) => {
      try {
        return JSON.parse(c.featureSelectionsJson || "[]") as FeatureSelection[];
      } catch {
        return [];
      }
    })
  ), [publishedConfigs]);

  const maxUnits = useMemo(
    () => computeMaxUnitsByFeature(featureSelectionsByConfig),
    [featureSelectionsByConfig],
  );

  const activeCountForAsset = useCallback((asset: ProjectAsset): Record<string, number> => {
    const config = publishedConfigs.find((c) => c.id === asset.productConfigId);
    if (!config) return maxUnits;
    let sels: FeatureSelection[] = [];
    try {
      sels = JSON.parse(config.featureSelectionsJson || "[]") as FeatureSelection[];
    } catch {
      return maxUnits;
    }
    if (sels.length === 0) return maxUnits;
    const out: Record<string, number> = {};
    for (const s of sels) {
      if (s.activeCount > 0) out[s.featureId] = s.activeCount;
    }
    return out;
  }, [maxUnits, publishedConfigs]);

  const applyRunUpdate = useCallback((run: AssetWorkflowRun) => {
    setRunsMap((prev) => {
      const list = prev[run.assetId] ?? [];
      const next = list.some((r) => r.id === run.id)
        ? list.map((r) => (r.id === run.id ? run : r))
        : [...list, run];
      return { ...prev, [run.assetId]: next };
    });
  }, []);

  const reload = useCallback(() => {
    runsDoneKeyRef.current = null;
    runsInflightKeyRef.current = null;
    setReloadTick((t) => t + 1);
  }, []);

  return {
    assets,
    runsMap,
    features,
    depsByFeature,
    featureSelectionsByConfig,
    maxUnitsByFeature: maxUnits,
    activeCountForAsset,
    loading,
    runsLoading,
    error,
    applyRunUpdate,
    reload,
  };
}
