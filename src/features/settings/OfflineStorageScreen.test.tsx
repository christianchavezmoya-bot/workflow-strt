import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const serviceMocks = vi.hoisted(() => ({
  getOfflineStorageOverview: vi.fn(),
  getProjectStorageSummaries: vi.fn(),
}));
const discardMocks = vi.hoisted(() => ({
  discardProjectFromDevice: vi.fn(),
}));
const syncEngineMocks = vi.hoisted(() => ({
  triggerSync: vi.fn().mockResolvedValue({}),
  canSync: true,
}));

vi.mock("../../services/offlineStorageService", () => serviceMocks);
vi.mock("../../services/projectDiscardService", () => discardMocks);
vi.mock("../../hooks/useSyncEngine", () => ({ useSyncEngine: () => syncEngineMocks }));

import OfflineStorageScreen from "./OfflineStorageScreen";

const baseOverview = {
  nGoUsageBytes: 2_147_483_648, // 2 GB
  nGoBudgetBytes: 10 * 1024 ** 3,
  health: { level: "HEALTHY", drivenBy: "budget-only", nGoUsageRatio: 0.2, deviceFreeRatio: null },
  device: { source: "UNAVAILABLE", freeBytes: null, totalBytes: null, quotaBytes: null, quotaUsageBytes: null },
  offlineProjectCount: 1,
  pendingSyncOperations: 0,
  droppedSyncOperations: 0,
  breakdown: [
    { category: "CAPTURED_MEDIA", count: 3, bytes: 1_000_000 },
    { category: "CONFIG_MEDIA", count: 0, bytes: 0 },
    { category: "DOCUMENT", count: 0, bytes: 0 },
    { category: "REPORT", count: 0, bytes: 0 },
    { category: "OTHER", count: 0, bytes: 0 },
  ],
};

function safeProject() {
  return {
    projectId: "proj-safe", name: "JOB-100", status: "Closed",
    estimatedBytes: 1_932_735_283, closedAtUtc: "2026-08-01T00:00:00.000Z", lastSyncedAt: null,
    discardEligibility: "SAFE_TO_REMOVE" as const,
  };
}

function unsafeProject() {
  return {
    projectId: "proj-unsafe", name: "JOB-200", status: "In Progress",
    estimatedBytes: 500_000_000, closedAtUtc: null, lastSyncedAt: "2026-09-20T00:00:00.000Z",
    discardEligibility: "UNSYNCED_CHANGES" as const,
  };
}

function renderScreen() {
  return render(<MemoryRouter><OfflineStorageScreen /></MemoryRouter>);
}

describe("OfflineStorageScreen", () => {
  it("renders the overview using REAL fields only — never a 'Last used' label", async () => {
    serviceMocks.getOfflineStorageOverview.mockResolvedValue(baseOverview);
    serviceMocks.getProjectStorageSummaries.mockResolvedValue([safeProject()]);

    renderScreen();

    expect(await screen.findByText("N-Go Offline Storage")).toBeInTheDocument();
    expect(screen.getByText("2.0 GB")).toBeInTheDocument(); // Used by N-Go
    expect(screen.getByText("HEALTHY")).toBeInTheDocument();
    expect(screen.getByText(/Closed/)).toBeInTheDocument();
    expect(screen.queryByText(/Last used/i)).not.toBeInTheDocument();
  });

  it("shows 'Remove from device' only for a SAFE_TO_REMOVE project, and a disabled 'Manage' for a blocked one — never 'Delete Project'", async () => {
    serviceMocks.getOfflineStorageOverview.mockResolvedValue(baseOverview);
    serviceMocks.getProjectStorageSummaries.mockResolvedValue([safeProject(), unsafeProject()]);

    renderScreen();
    await screen.findByText("JOB-100");

    expect(screen.getByRole("button", { name: /remove from device/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^manage$/i })).toBeDisabled();
    expect(screen.queryByText(/delete project/i)).not.toBeInTheDocument();
  });

  it("clicking Remove shows the exact required confirmation copy, and confirming calls discardProjectFromDevice", async () => {
    serviceMocks.getOfflineStorageOverview.mockResolvedValue(baseOverview);
    serviceMocks.getProjectStorageSummaries.mockResolvedValue([safeProject()]);
    discardMocks.discardProjectFromDevice.mockResolvedValue({
      projectId: "proj-safe", removed: true, eligibility: "SAFE_TO_REMOVE",
      message: "This project's offline copy was removed from this device. It remains available online and can be downloaded again later.",
    });

    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /remove from device/i }));

    expect(screen.getByText(/Synced server data will not be deleted\./)).toBeInTheDocument();
    expect(screen.getByText(/You can download this project again later\./)).toBeInTheDocument();

    const buttons = await screen.findAllByRole("button", { name: /remove from device/i });
    fireEvent.click(buttons[buttons.length - 1]); // the dialog's confirm button

    await waitFor(() => expect(discardMocks.discardProjectFromDevice).toHaveBeenCalledWith("proj-safe"));
  });

  it("shows the blocked dialog with Sync Now / Cancel when the service refuses to remove (defense in depth — the UI never bypasses the service's verdict)", async () => {
    serviceMocks.getOfflineStorageOverview.mockResolvedValue(baseOverview);
    serviceMocks.getProjectStorageSummaries.mockResolvedValue([safeProject()]); // UI thought it was safe...
    discardMocks.discardProjectFromDevice.mockResolvedValue({
      projectId: "proj-safe", removed: false, eligibility: "UNSYNCED_CHANGES",
      message: "This project has unsynced changes and cannot be removed from this device yet (3 workflow changes, 4 photos/videos, 1 issue).",
    });

    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /remove from device/i }));
    const buttons = await screen.findAllByRole("button", { name: /remove from device/i });
    fireEvent.click(buttons[buttons.length - 1]);

    expect(await screen.findByText(/cannot be removed from this device yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sync now/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sync now/i }));
    await waitFor(() => expect(syncEngineMocks.triggerSync).toHaveBeenCalled());
  });

  it("shows an empty state when no projects are cached, without erroring", async () => {
    serviceMocks.getOfflineStorageOverview.mockResolvedValue({ ...baseOverview, offlineProjectCount: 0 });
    serviceMocks.getProjectStorageSummaries.mockResolvedValue([]);

    renderScreen();

    expect(await screen.findByText(/no projects are downloaded/i)).toBeInTheDocument();
  });
});
