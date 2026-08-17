import type { ProjectAsset } from "../../types/projectAsset";
import type { User } from "../../types/user";
import type { Project } from "../../types/project";
import { findCaptureMatch, type ProjectCaptureSearchHit } from "../../utils/projectCaptureTable";
import { matchesWordStart } from "../../utils/textMatch";

export type AssetSearchResult = {
  asset: ProjectAsset;
  score: number;
  matchLabel?: string;
};

export function rankAssetSearchResults(
  assets: ProjectAsset[],
  query: string,
  users: User[],
  captureIndexByAsset: Record<string, { hits: ProjectCaptureSearchHit[] } | undefined>,
): AssetSearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const ranked: AssetSearchResult[] = [];
  for (const asset of assets) {
    if (asset.isDeleted) continue;
    const installerName = asset.installedBy ?? users.find((u) => u.id === asset.assignedUserId)?.fullName ?? "";
    const tagHit = matchesWordStart(asset.assetTag, q);
    const serialHit = matchesWordStart(asset.serialNumber, q);
    const nameHit = matchesWordStart(asset.assetName, q);
    const brandHit = matchesWordStart(asset.manufacturer, q) || matchesWordStart(asset.assetModel, q);
    const installerHit = matchesWordStart(installerName, q);
    const locationHit = matchesWordStart(asset.location, q);
    const captureMatch = findCaptureMatch(captureIndexByAsset[asset.id]?.hits, q, matchesWordStart);

    if (!tagHit && !serialHit && !nameHit && !brandHit && !installerHit && !locationHit && !captureMatch) {
      continue;
    }

    let score = 0;
    let matchLabel: string | undefined;
    if (tagHit) { score += 100; matchLabel = "Asset tag"; }
    else if (brandHit) { score += 90; matchLabel = asset.manufacturer ? `Brand: ${asset.manufacturer}` : `Model: ${asset.assetModel}`; }
    else if (serialHit) { score += 80; matchLabel = `S/N: ${asset.serialNumber}`; }
    else if (nameHit) { score += 70; matchLabel = asset.assetName; }
    else if (installerHit) { score += 50; matchLabel = `Installer: ${installerName}`; }
    else if (locationHit) { score += 40; matchLabel = `Location: ${asset.location}`; }
    else if (captureMatch) {
      score += captureMatch.kind === "value" ? 35 : captureMatch.kind === "feature" ? 25 : 15;
      matchLabel = captureMatch.label;
    }
    ranked.push({ asset, score, matchLabel });
  }

  ranked.sort((a, b) => b.score - a.score || a.asset.assetTag.localeCompare(b.asset.assetTag));
  return ranked.slice(0, 50);
}

export function resolveAssetSearchProjectLabel(
  asset: ProjectAsset,
  projects: Project[],
): string | undefined {
  return projects.find((p) => p.id === asset.projectId)?.jobNumber;
}

export function resolveAssetSearchInstallerName(
  asset: ProjectAsset,
  users: User[],
): string | undefined {
  return asset.installedBy ?? users.find((u) => u.id === asset.assignedUserId)?.fullName;
}
