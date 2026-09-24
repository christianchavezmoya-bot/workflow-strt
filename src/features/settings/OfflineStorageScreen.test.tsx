import { beforeEach, describe, expect, it, vi } from "vitest";
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

const ZERO_BLOCKERS = {
  workflowChanges: 0, photosVideosPending: 0, issuesPending: 0,
  timeTrackingPending: 0, failedSyncOperations: 0, otherPendingOperations: 0,
};

function safeProject() {
  return {
    projectId: "proj-safe", name: "JOB-100", status: "Closed",
    estimatedBytes: 1_932_735_283, closedAtUtc: "2026-08-01T00:00:00.000Z", lastSyncedAt: null,
    discardCheck: {
      projectId: "proj-safe", eligibility: "SAFE_TO_REMOVE" as const, blockers: ZERO_BLOCKERS,
      message: "This project has no unsynced changes and can be safely removed from this device.",
    },
  };
}

function unsafeProject() {
  return {
    projectId: "proj-unsafe", name: "JOB-200", status: "In Progress",
    estimatedBytes: 500_000_000, closedAtUtc: null, lastSyncedAt: "2026-09-20T00:00:00.000Z",
    discardCheck: {
      projectId: "proj-unsafe", eligibility: "UNSYNCED_CHANGES" as const,
      blockers: { ...ZERO_BLOCKERS, workflowChanges: 3, photosVideosPending: 4, issuesPending: 1 },
      message: "This project has unsynced changes and cannot be removed from this device yet (3 workflow changes, 4 photos/videos, 1 issue).",
    },
  };
}

function renderScreen() {
  return render(<MemoryRouter><OfflineStorageScreen /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  syncEngineMocks.triggerSync.mockResolvedValue({});
  syncEngineMocks.canSync = true;
});

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

  it("shows 'Remove from device' only for a SAFE_TO_REMOVE project, and an ENABLED 'Manage' for a blocked one — never 'Delete Project' (Blocker 1)", async () => {
    serviceMocks.getOfflineStorageOverview.mockResolvedValue(baseOverview);
    serviceMocks.getProjectStorageSummaries.mockResolvedValue([safeProject(), unsafeProject()]);

    renderScreen();
    await screen.findByText("JOB-100");

    expect(screen.getByRole("button", { name: /remove from device/i })).toBeEnabled();
    // Required test: unsafe project's Manage button is ENABLED, not a disabled dead-end.
    expect(screen.getByRole("button", { name: /^manage$/i })).toBeEnabled();
    expect(screen.queryByText(/delete project/i)).not.toBeInTheDocument();
  });

  // Required test: "Remove from device" is NOT available for unsafe projects.
  it("never renders a 'Remove from device' button for an unsafe (blocked) project", async () => {
    serviceMocks.getOfflineStorageOverview.mockResolvedValue(baseOverview);
    serviceMocks.getProjectStorageSummaries.mockResolvedValue([unsafeProject()]);

    renderScreen();
    await screen.findByText("JOB-200");

    expect(screen.queryByRole("button", { name: /remove from device/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^manage$/i })).toBeInTheDocument();
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

  // Required test: tapping "Manage" on a known-blocked project surfaces WHY it's blocked — the
  // fixed required text, plus structured blocker counts — reusing the pre-computed discardCheck
  // (no second round-trip to discardProjectFromDevice).
  it("clicking Manage on a blocked project shows the fixed blocked message and structured blocker counts — never Remove", async () => {
    serviceMocks.getOfflineStorageOverview.mockResolvedValue(baseOverview);
    serviceMocks.getProjectStorageSummaries.mockResolvedValue([unsafeProject()]);

    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /^manage$/i }));

    expect(discardMocks.discardProjectFromDevice).not.toHaveBeenCalled();
    expect(await screen.findByText("This project has unsynced changes and cannot be removed from this device yet.")).toBeInTheDocument();
    expect(screen.getByText("3 workflow changes")).toBeInTheDocument();
    expect(screen.getByText("4 photos/videos")).toBeInTheDocument();
    expect(screen.getByText("1 issues")).toBeInTheDocument();
    // No destructive bypass reachable from this dialog.
    expect(screen.queryByRole("button", { name: /remove from device/i })).not.toBeInTheDocument();
  });

  // Required test: Sync Now is available (and functions) from the Manage dialog for a blocked
  // project — not only as a defense-in-depth fallback off a failed Remove attempt.
  it("Sync Now is available directly from the Manage dialog for a blocked project", async () => {
    serviceMocks.getOfflineStorageOverview.mockResolvedValue(baseOverview);
    serviceMocks.getProjectStorageSummaries.mockResolvedValue([unsafeProject()]);

    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /^manage$/i }));

    const syncNowButton = await screen.findByRole("button", { name: /sync now/i });
    expect(syncNowButton).toBeEnabled();
    fireEvent.click(syncNowButton);

    await waitFor(() => expect(syncEngineMocks.triggerSync).toHaveBeenCalled());
    // The dialog closes and the summary reloads after sync.
    await waitFor(() => expect(serviceMocks.getProjectStorageSummaries).toHaveBeenCalledTimes(2));
  });

  // Required test: after a successful Sync Now (which refreshes eligibility + storage summary),
  // a previously-blocked project becomes eligible and shows "Remove from device" instead of
  // "Manage" — no page reload/navigation required.
  it("after Sync Now completes and eligibility is re-fetched, a project that became safe shows 'Remove from device' instead of 'Manage'", async () => {
    serviceMocks.getOfflineStorageOverview.mockResolvedValue(baseOverview);
    serviceMocks.getProjectStorageSummaries
      .mockResolvedValueOnce([unsafeProject()])
      .mockResolvedValueOnce([safeProject()]); // after Sync Now, the same project (re-keyed) is now safe

    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: /^manage$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /sync now/i }));

    await waitFor(() => expect(syncEngineMocks.triggerSync).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: /remove from device/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^manage$/i })).not.toBeInTheDocument();
  });

  // Native device capacity: the screen must show a REAL "Available on device" figure once the
  // DeviceStorage plugin reports one, with the API name kept to an internal data-* attribute.
  it("shows real device free space on native, exposing the source only as an internal diagnostic attribute", async () => {
    serviceMocks.getOfflineStorageOverview.mockResolvedValue({
      ...baseOverview,
      device: {
        source: "NATIVE_DEVICE_API",
        freeBytes: 45_755_838_464, // 42.6 GB
        totalBytes: 128 * 1024 ** 3,
        quotaBytes: null,
        quotaUsageBytes: null,
      },
    });
    serviceMocks.getProjectStorageSummaries.mockResolvedValue([safeProject()]);

    renderScreen();

    const value = await screen.findByText("42.6 GB");
    expect(value).toBeInTheDocument();
    // Developers can tell the sources apart in the DOM...
    expect(value).toHaveAttribute("data-device-storage-source", "NATIVE_DEVICE_API");
    // ...but users never see a technical API name, and a native reading is never labelled an estimate.
    expect(screen.queryByText(/NATIVE_DEVICE_API/)).not.toBeInTheDocument();
    expect(screen.queryByText(/browser estimate/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
  });

  it("still shows 'Unknown' (never a fabricated figure) when device capacity is unavailable", async () => {
    serviceMocks.getOfflineStorageOverview.mockResolvedValue(baseOverview); // device.source UNAVAILABLE
    serviceMocks.getProjectStorageSummaries.mockResolvedValue([safeProject()]);

    renderScreen();

    const value = await screen.findByText("Unknown");
    expect(value).toHaveAttribute("data-device-storage-source", "UNAVAILABLE");
  });

  it("shows an empty state when no projects are cached, without erroring", async () => {
    serviceMocks.getOfflineStorageOverview.mockResolvedValue({ ...baseOverview, offlineProjectCount: 0 });
    serviceMocks.getProjectStorageSummaries.mockResolvedValue([]);

    renderScreen();

    expect(await screen.findByText(/no projects are downloaded/i)).toBeInTheDocument();
  });
});
