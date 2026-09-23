import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const platformMocks = vi.hoisted(() => ({ isMobileNativePlatform: vi.fn(() => true) }));
const offlineModeMocks = vi.hoisted(() => ({
  useOfflineMode: () => ({ isManualOffline: false, isOfflineMode: false, goOffline: vi.fn(), goOnline: vi.fn() }),
}));
const syncEngineMocks = vi.hoisted(() => ({ triggerSync: vi.fn().mockResolvedValue({}), canSync: true, syncing: false }));
const bootstrapMocks = vi.hoisted(() => ({
  offlineBootstrapService: {
    getStatus: vi.fn().mockResolvedValue({
      lastCompletedAt: new Date("2026-09-20T00:00:00.000Z"), isStale: true, isRunning: false,
      summary: { deepAssets: 5, configs: 2 }, readyForOffline: false,
    }),
  },
}));
const storageServiceMocks = vi.hoisted(() => ({ getOfflineStorageOverview: vi.fn() }));
const syncPrefMocks = vi.hoisted(() => ({ getManualDownloadOnly: vi.fn(() => false), setManualDownloadOnly: vi.fn() }));

vi.mock("../../utils/platform", () => platformMocks);
vi.mock("../../contexts/OfflineModeContext", () => offlineModeMocks);
vi.mock("../../hooks/useSyncEngine", () => ({ useSyncEngine: () => syncEngineMocks }));
vi.mock("../../services/offlineBootstrapService", () => bootstrapMocks);
vi.mock("../../services/offlineStorageService", () => storageServiceMocks);
vi.mock("../../utils/syncPreferences", () => syncPrefMocks);

import OfflineReadinessPanel from "./OfflineReadinessPanel";

beforeEach(() => {
  vi.clearAllMocks();
  syncEngineMocks.triggerSync.mockResolvedValue({});
  bootstrapMocks.offlineBootstrapService.getStatus.mockResolvedValue({
    lastCompletedAt: new Date("2026-09-20T00:00:00.000Z"), isStale: true, isRunning: false,
    summary: { deepAssets: 5, configs: 2 }, readyForOffline: false,
  });
});

function healthOverview(level: "HEALTHY" | "WARNING" | "HIGH" | "CRITICAL", bytes = 6_800_000_000) {
  return {
    nGoUsageBytes: bytes, nGoBudgetBytes: 10 * 1024 ** 3,
    health: { level, drivenBy: "budget", nGoUsageRatio: 0.5, deviceFreeRatio: null },
    device: { source: "UNAVAILABLE", freeBytes: null, totalBytes: null, quotaBytes: null, quotaUsageBytes: null },
    offlineProjectCount: 2, pendingSyncOperations: 0, droppedSyncOperations: 0, breakdown: [],
  };
}

function renderPanel() {
  return render(<MemoryRouter><OfflineReadinessPanel /></MemoryRouter>);
}

describe("OfflineReadinessPanel — Phase 1H sync storage warning", () => {
  it("HEALTHY: tapping Sync & download proceeds immediately, no warning dialog", async () => {
    storageServiceMocks.getOfflineStorageOverview.mockResolvedValue(healthOverview("HEALTHY"));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /sync & download/i }));

    await waitFor(() => expect(syncEngineMocks.triggerSync).toHaveBeenCalledWith({ forceDownload: true }));
    expect(screen.queryByText(/storage is running low/i)).not.toBeInTheDocument();
  });

  it("WARNING: still proceeds immediately — the warning is reserved for HIGH/CRITICAL only", async () => {
    storageServiceMocks.getOfflineStorageOverview.mockResolvedValue(healthOverview("WARNING"));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /sync & download/i }));

    await waitFor(() => expect(syncEngineMocks.triggerSync).toHaveBeenCalled());
    expect(screen.queryByText(/storage is running low/i)).not.toBeInTheDocument();
  });

  it("HIGH: shows the warning dialog with the real usage figure, and does NOT sync until confirmed", async () => {
    storageServiceMocks.getOfflineStorageOverview.mockResolvedValue(healthOverview("HIGH", Math.round(6.8 * 1024 ** 3)));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /sync & download/i }));

    expect(await screen.findByText(/storage is running low/i)).toBeInTheDocument();
    expect(screen.getByText(/6\.8 GB/)).toBeInTheDocument();
    expect(syncEngineMocks.triggerSync).not.toHaveBeenCalled(); // not yet — waiting on the user
  });

  it("CRITICAL: 'Continue Anyway' proceeds with the download", async () => {
    storageServiceMocks.getOfflineStorageOverview.mockResolvedValue(healthOverview("CRITICAL"));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /sync & download/i }));
    fireEvent.click(await screen.findByRole("button", { name: /continue anyway/i }));

    await waitFor(() => expect(syncEngineMocks.triggerSync).toHaveBeenCalledWith({ forceDownload: true }));
  });

  it("CRITICAL: 'Cancel' does not call triggerSync at all", async () => {
    storageServiceMocks.getOfflineStorageOverview.mockResolvedValue(healthOverview("CRITICAL"));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /sync & download/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^cancel$/i }));

    expect(syncEngineMocks.triggerSync).not.toHaveBeenCalled();
  });

  it("a failed health check never blocks the sync the user asked for (fails open)", async () => {
    storageServiceMocks.getOfflineStorageOverview.mockRejectedValue(new Error("IDB unavailable"));
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /sync & download/i }));

    await waitFor(() => expect(syncEngineMocks.triggerSync).toHaveBeenCalledWith({ forceDownload: true }));
  });
});
