# Services & Runtime Decomposition

> Companion to [`ARCHITECTURE.md`](ARCHITECTURE.md). Human-authored — edit by hand.

## Reality check: this is a modular monolith, not distributed microservices

There is **one deployable backend process** (`Commtrac.Api`, an ASP.NET Core 8 app)
backed by **one SQLite database**, and **one frontend bundle** shipped three ways.
There is no service mesh, no per-service database, no inter-process RPC. So "services"
here means **logical boundaries inside the process**, not independently deployed units:

1. **Resource controllers** — one HTTP surface per domain (the closest thing to a
   "service API").
2. **DI-registered domain services** — scoped business-logic units injected into
   controllers.
3. **Background / hosted services** — long-running workers decoupled from requests.
4. **Real-time channel** — the SSE hub that fans out change events.
5. **Frontend service layer** — ~60 TS modules, roughly one per backend resource.

If this ever needs to be split into true microservices, the seams below are where the
knife goes.

---

## 1. Background / hosted services (the real "services")

Registered in [`server/Commtrac.Api/Program.cs`](server/Commtrac.Api/Program.cs) and
run out-of-band from HTTP requests.

| Service | Lifetime | Role |
|---|---|---|
| `SqliteBackupService` | Singleton + `HostedService` | Periodic SQLite backups on a `PeriodicTimer` (interval/retention from `DatabaseBackups` config); also exposes on-demand backup/restore. Ensures a recent backup on startup. |
| `DocumentSearchIndexWorker` | `HostedService` | Drains a `Channel<DocumentIndexWorkItem>` and (re)builds the document search index — full rebuild, per-library-doc, per-asset-doc, plus removals. |
| `SseHub` | Singleton | In-memory fan-out of push events to all connected clients (see §4). |

### SQLite backup worker
`SqliteBackupService : BackgroundService`
([`Services/SqliteBackupService.cs`](server/Commtrac.Api/Services/SqliteBackupService.cs)).
Config section `DatabaseBackups` (`Enabled`, `Directory`, `IntervalHours`,
`RetentionDays`). Serialized via a `SemaphoreSlim` so scheduled and manual backups
never overlap. Registered **twice on purpose** — as a singleton (so controllers can
call `ListBackupsAsync`/`CreateBackupAsync`) and as the hosted service.

### Document search indexing pipeline
([`Services/DocumentSearchIndexing.cs`](server/Commtrac.Api/Services/DocumentSearchIndexing.cs)).
A small CQRS-ish pipeline built from several cooperating singletons:

| Interface / type | Purpose |
|---|---|
| `IDocumentSearchIndexQueue` | Enqueue full-rebuild / per-document index / remove |
| `IDocumentSearchIndexChannel` | The underlying `Channel` producer/consumer |
| `IDocumentSearchIndexQueueMetrics` | `QueueDepth` for observability |
| `IDocumentSearchIndexMonitor` (`DocumentSearchIndexStatusStore`) | Live status snapshot: running?, work type, processed/total, last error |
| `DocumentSearchIndexWorker` (hosted) | The consumer that does the indexing |

`DocumentSearchIndexQueue` is registered once and exposed under **four interfaces**
(queue, channel, metrics) — a single object playing multiple roles.

---

## 2. DI-registered domain services

Scoped/singleton units injected into controllers
([`Program.cs`](server/Commtrac.Api/Program.cs) lines ~29–50):

| Service | Lifetime | Responsibility |
|---|---|---|
| `IInspectionImportAdapterService` | Scoped | Adapt external inspection import formats |
| `IInspectionImportValidatorService` | Scoped | Validate inspection imports |
| `NotificationSettingsService` | Scoped | Per-user/role notification preferences |
| `NotificationFeedService` | Scoped | Build the notification inbox feed |
| `NotificationService` | Scoped | Dispatch notifications (email/SMS/in-app) |
| `ProjectLifecycleService` | Scoped | Project status transitions / lifecycle rules |
| `RecoveryService` | Scoped | Data recovery / restore orchestration |
| `IEmailSender` (`EmailSender`) | Scoped | SMTP send; config section `Email` |
| `ISmsSender` (`SmsSender`) | Scoped | SMS send; config section `Sms` |
| `IDocumentContentSearchService` | Scoped | Query the document search index |
| `HttpClient` factory | — | Outbound HTTP (e.g. Quickbase integration) |

External integration touchpoints live behind controllers such as
`QuickbaseDiscoveryController` / `QuickbaseGoodsMovementsController` and the
`AddHttpClient()` registration.

---

## 3. Resource surface (controller "service" boundaries)

Flat controllers, one per resource, thin over EF Core. **Routes are flat with
`projectId` as a query param**, not nested — e.g.
`GET /api/project-contacts?projectId=xxx`. Grouped by domain:

| Domain | Controllers |
|---|---|
| **Core** | `Auth`, `Users`, `Projects`, `ProjectAssets`, `Assets`, `Issues`, `Dashboard`, `Health` |
| **Workflow / e-sign** | `WorkflowConfigs`, `WorkflowConfigFeatures`, `WorkflowTypes`, `WorkflowTemplates`, `WorkInstructions`, `WorkInstructionTemplates`, `WorkOrders`, `AssetWorkflowRuns`, `AssetWorkflowAssignments`, `SignatureTokens`, `SignatureEvents`, `PublicSign` |
| **Project CRM** | `ProjectContacts`, `ProjectDeliveryProfiles`, `ProjectInboundItems`, `Customers`, `Sites`, `Offices`, `Divisions` |
| **Inspections** | `Inspections`, `InspectionImports`, `Installations`, `InstallationTabs`, `InstallationTabRows` |
| **Admin / config** | `Admin`, `AdminTabs`, `AdminTabRows`, `Settings`, `BrandSettings`, `RoleConfigs`, `CustomFields`, `FieldDefinitions`, `FieldValues`, `TableConfigs`, `Features`, `FeatureDependencies`, `Products` |
| **Content / sync** | `Documents`, `AssetDocuments`, `AssetDocumentLinks`, `Search`, `Notifications`, `MobileUpload`, `Sse` |
| **BOM (flag-gated)** | `BomImportRuns` (+ `DispatchOrders`, `QuickbaseDiscovery`, `QuickbaseGoodsMovements`) |

> The generated [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) carries the
> authoritative, always-current controller inventory — regenerate with
> `npm run docs:update`.

---

## 4. Real-time channel (SSE)

`SseController` + `SseHub` ([`Services/SseHub.cs`](server/Commtrac.Api/Services/SseHub.cs))
provide server→client push over **Server-Sent Events**:

- `SseHub` is a **singleton** tracking every active connection in a
  `ConcurrentDictionary` **keyed by connection GUID, not userId** — so a single user
  with multiple tabs gets multiple independent streams.
- Each `SseConnection` owns an **unbounded, multi-writer/single-reader `Channel`**
  (writers: heartbeat + broadcasts; reader: the stream loop).
- `BroadcastExceptAsync(excludeUserId, …)` fans out a change event to everyone
  **except the originator**, so the acting client doesn't get an echo of its own write.
- Payloads are serialized camelCase to match the frontend.

This is the backend half of the sync story; the frontend half is the offline write
queue + `useSyncEngine` (see [`ARCHITECTURE.md`](ARCHITECTURE.md#offline-write-queue--sync-engine)).

---

## 5. Frontend service layer

`src/services/` holds ~60 TypeScript modules — roughly **one per backend resource** —
that wrap a single axios instance and local data. They fall into three buckets:

**Domain services** (thin HTTP wrappers, one per resource):
`projectService`, `projectAssetService`, `assetService`, `issueService`,
`inspectionService`, `documentService`, `assetDocumentService`, `userService`,
`customerService`, `productService`, `siteService`, `officesService`,
`divisionService`, `dispatchService`, `notificationService`, `settingsService`,
`roleConfigService`, `brandSettingsService`, `dashboardService`, `signatureService`,
`workflowConfigService`, `workflowTypeService`, `assetWorkflowRunService`,
`assetWorkflowAssignmentService`, `workInstructionService`, `workOrderService`,
`projectContactService`, `fieldService`, `customFieldService`, `tableConfigService`,
`featureService`, `featureDependencyService`, `quickbaseService`, and more.

**Infrastructure services** (the offline-first plumbing):

| Module | Role |
|---|---|
| `api.ts` | The single axios instance: JWT injection, silent refresh, SWR GET cache, IndexedDB fallback — **native-only caching** |
| `apiBase.ts` | Resolves `VITE_API_BASE` / localhost default |
| `localDB.ts`, `syncQueue.ts` | IndexedDB pending-action queue |
| `offlineStore.ts` | Workflow-run snapshots for offline runs |
| `mediaStore.ts` | Pending media blobs |
| `webFreshCache.ts` | Web-side freshness cache |
| `networkService.ts`, `connectivityMonitor.ts` | Online/offline detection |
| `secureStorage.ts`, `biometricAuth.ts` | Keychain/Keystore + native lock screen |
| `authService.ts` | Login / token lifecycle |

> **Key gotcha (repeated because it bites):** the axios cache, IndexedDB fallback, and
> offline behavior in `api.ts` are gated on `isMobileNativePlatform()`. **On web,
> requests pass straight through with no cache.** Any change to request/response
> behavior must account for both paths.

---

## Communication contract

- **Transport**: HTTPS/HTTP JSON over a single axios client; SSE for push.
- **Auth**: JWT bearer with **short claim names**; `role` claim carries authorization
  (`MapInboundClaims = false`, `RoleClaimType = "role"`). A `401` (except auth /
  brand-settings) wipes the token and redirects to `/login`.
- **Routing style**: flat routes, `projectId` passed as a **query param** (not nested).
- **Conflict handling**: offline writes replay with **409/412 conflict detection**;
  temp IDs are remapped to server IDs after first sync.
- **Blocking rule**: `completeRun` with unresolved blocking issues returns **HTTP 422**.

## Deployment topology

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│  React bundle (dist/)        │        │  Commtrac.Api (ASP.NET Core 8)   │
│   • Web browser              │  HTTP  │   • Controllers (per resource)   │
│   • Android (Capacitor)      │ ─────► │   • Domain services (DI)         │
│   • iOS (Capacitor)          │  SSE   │   • Hosted: backup, doc-index    │
│                              │ ◄───── │   • SseHub (push)                │
└─────────────────────────────┘        │             │                    │
                                        │             ▼                    │
                                        │      SQLite (WAL) + backups/     │
                                        └──────────────────────────────────┘
```

One API process, one SQLite file (WAL mode, busy timeout, periodic backups). CORS
policy `"frontend"` admits localhost / private-LAN / IP origins so mobile devices on
the LAN can reach the API during testing.

## Adding a new service / resource

1. **Entity** in `Models/Entities.cs`; **DTOs** in `Models/Dtos.cs`.
2. **Migration**: `dotnet ef migrations add <Name>` (applied on startup). If you must
   patch outside migration history, add an idempotent `Ensure*` in
   `Data/DbInitializer.cs`.
3. **Controller** in `Controllers/` — flat route, `projectId` as query param.
4. **Domain service** (only if there's real logic) registered in `Program.cs`.
5. **Frontend service** in `src/services/` wrapping `api.ts`.
6. If it must work **offline**, route writes through `useSyncEngine` and preserve the
   **temp-ID → server-ID remap** for any new entity references.
7. If clients need live updates, broadcast via `SseHub.BroadcastExceptAsync`.
8. Run `npm run build` (the only typecheck) and `dotnet build`.
