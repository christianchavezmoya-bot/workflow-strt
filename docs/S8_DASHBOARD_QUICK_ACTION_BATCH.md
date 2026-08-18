# S8 Batch — `useDashboardQuickAction` extraction

Planned follow-up to the dashboard hook extractions (`useDashboardWorkspace`, `useDashboardAttention`). **Do not merge with the installations handlers batch** — this path is tightly coupled to WorkOrderRunner launch, issue/signature repair, and native “My Jobs Today” card taps.

## Scope (~600+ lines in `Dashboard.tsx`)

Extract into `src/features/dashboard/useDashboardQuickAction.ts` (and optionally small pure helpers in `dashboardQuickActionLogic.ts`):

| Concern | Current symbols | Notes |
|---|---|---|
| Dialog state | `quickActionAsset`, `quickActionOpen`, `quickActionAssignments`, `quickActionRuns`, `quickActionLoading` | Keep `DashboardQuickActionDialog.tsx` as presentational |
| Context load | `loadQuickActionContext`, `resolveProductWorkflowForAsset` | Shares patterns with installations `useAssetInstallationWorkflowLaunch` |
| Attention | `quickActionAttention`, `getQuickActionAttentionForAsset`, `resolveMissingMediaForAsset`, `buildFallbackMissingMediaFlag` | Depends on `openIssues`, `pendingSigs`, `missingMediaFlags` from attention hook |
| Card routing | `getMyJobsCardAction`, `handleMyJobsAssetTap`, `openQuickActionOrStart`, `openMissingMediaFromDashboardAsset` | Native vs web button labels |
| Primary CTA | `quickActionPrimaryAction` | Priority: missing media → resume → blocking issue → signature → observation → start |
| Workflow launch | `canStartDirectlyFromDashboard`, `checkAssignmentThenStartFromDashboard`, `startWorkflowFromDashboard`, `resumeActiveRunFromDashboard`, `launchProductWorkflowFromDashboard`, `openRunnerWithPayload` | **Stays wired to runner state** (`runnerOpen`, `runnerAsset`, etc.) via callbacks — do not extract runner itself in this batch |
| Auto-assign | `autoAssignConfirm`, `confirmAutoAssignAndStartFromDashboard` | Uses `projectAssetService.patchAssignment` |
| Docs chip | `docsDialogOpen`, `docsCount`, `docsLoading` (quick-action scoped) | Optional sub-hook if wiring gets noisy |

## Hook API (sketch)

```ts
type UseDashboardQuickActionParams = {
  user: User;
  isNativePlatform: boolean;
  openIssues: OpenIssueRecord[];
  pendingSigs: PendingSignatureRecord[];
  missingMediaFlags: MissingMediaFlag[];
  dashboardAssignmentsMap: Record<string, WorkflowAssignment[]>;
  nativeMyJobsDisplayStateByAssetId: Map<string, ...>;
  nativeMyJobsCardContext: Record<string, ...>;
  // Runner bridges (callbacks — runner state stays in Dashboard)
  openRunnerWithPayload: (...) => Promise<boolean>;
  openIssueRepair: (issue: OpenIssueRecord) => Promise<void>;
  openSignatureRepair: (sig: PendingSignatureRecord) => void;
  setPhotoUploadMode / setPhotoUploadTarget: ...;
  setDashboardError: ...;
};

// Returns dialog state, handlers, quickActionPrimaryAction, getMyJobsCardAction, handleMyJobsAssetTap
```

## Extraction order

1. Pure helpers → `dashboardQuickActionLogic.ts` (`canStartDirectlyFromDashboard`, attention builders, `getMyJobsCardAction` inputs).
2. Context + dialog handlers → `useDashboardQuickAction`.
3. Wire Dashboard; leave runner block (~L1646–1661, `openRunnerWithPayload`) in page, passed as deps.
4. Reuse `pickPreferredAssignment` from `assetInstallationPageLogic.ts` where assignment preference aligns.

## Native smoke test checklist (required before merge)

Run on **Capacitor Android or iOS** with installer account and seeded “My Jobs Today” assets:

| # | Scenario | Expected |
|---|---|---|
| 1 | Tap asset — not started, assigned to self, single workflow | Runner opens directly (no dialog) |
| 2 | Tap asset — in-progress run | Resume runner |
| 3 | Tap asset — missing media / “Add Photos” card | Photo upload flow opens |
| 4 | Tap asset — blocking issue | Issue repair dialog |
| 5 | Tap asset — pending installer/customer signature | Signature repair flow |
| 6 | Tap asset — assigned to another user | Auto-assign confirm → patchAssignment → start |
| 7 | Tap asset — unassigned | Auto-assign confirm |
| 8 | Tap asset — multiple assignments, no direct-start path | Quick action dialog with correct primary CTA |
| 9 | Open quick action dialog → Documents | Docs dialog opens, count loads |
| 10 | Offline: tap with cached assignment + config | Runner or offline-config alert (no silent failure) |

Also spot-check **web** dashboard: quick action dialog still opens for ambiguous cases; labels differ (“Add Missing Photos” vs “Add Photos”).

## Out of scope (this batch)

- WorkOrderRunner component/state extraction
- Inspection import dialog stub (`importDialogOpen` — pre-existing QA flag)
- Manager double install-tab, auto-assign label inconsistency, supervisor UUID in Not Started row
- Changes to `DashboardQuickActionDialog.tsx` layout unless required for hook wiring

## Success metrics

- `Dashboard.tsx` drops ~500–700 lines
- Bundle budget: Dashboard chunk stays under 40 KB gzip
- All 390+ unit tests pass; no new e2e required if smoke checklist completed on device
- CI green (7 checks)

## Branch naming

`cursor/s8-dashboard-quick-action-hook-cd21`
