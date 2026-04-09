# Commtrac Codex 915 — Application Architecture
**Last updated: 2026-04-09**

---

## 1. Overview

Commtrac Codex 915 is a full-stack project & asset management platform delivered as:

| Target | Stack | Entry point |
|---|---|---|
| **Web browser** | React 18 + TypeScript + MUI v5 served by Vite | `http://<host>:5173` |
| **iOS native app** | Same React bundle wrapped in Capacitor 8 → Xcode | `ios/App/App.xcodeproj` |
| **REST API** | ASP.NET Core 8 + EF Core 8 + SQLite | `http://<host>:4000/api` |

The web and iOS apps share **100% of the same React source code**. iOS-specific behaviour is isolated to responsive layout breakpoints (`useMediaQuery`) and Capacitor plug-in calls (StatusBar colour, safe-area insets via CSS `env()`).

### 1.1 Permanent Access-Control Rule

User-scoped visibility and edit permissions are a permanent platform rule.

- `Admin` can view and modify all records.
- `Project Manager` can view records within their allowed scope, but PM-level edits are restricted to projects they own via `AssignedPmUserId`.
- `Installer` / `Technician` visibility is based on assignment and participation scope.
- `View-only` mode never expands visibility and blocks all state-changing API actions.

This rule must be enforced backend-first. New features must not return unrestricted datasets and then rely on React-only filtering or hidden buttons for protection.

---

## 2. Repository Layout

```
915/
├── src/                        # React frontend (shared web + iOS)
├── server/Commtrac.Api/        # ASP.NET Core 8 backend
├── ios/                        # Capacitor iOS native wrapper
│   └── App/
│       ├── App.xcodeproj       # Xcode project
│       └── CapApp-SPM/         # Swift Package Manager deps
├── dist/                       # Vite production build (→ copied into iOS bundle by Capacitor)
├── public/                     # Static assets
├── docs/                       # Architecture, schema, ERD, guides
├── capacitor.config.ts         # Capacitor / iOS bridge config
├── vite.config.ts              # Vite (dev server port 5173, host 0.0.0.0)
├── package.json                # Frontend dependencies
├── tsconfig.json               # TypeScript config
└── 915.sln                     # .NET solution file
```

---

## 3. Frontend — `src/`

### 3.1 Folder structure

```
src/
├── app/
│   ├── App.tsx                 # Root: providers + theme + router
│   └── routes.tsx              # All React Router v6 routes
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx        # Main shell: sidebar (desktop) + bottom tabs (mobile)
│   │   ├── Sidebar.tsx         # Desktop left nav
│   │   └── Topbar.tsx          # Desktop header / iOS-style top bar on mobile
│   ├── DynamicFieldsForm.tsx   # Renders configurable field definitions
│   ├── FieldNotificationBar.tsx
│   ├── GlobalOfficeMap.tsx
│   ├── QRUploadButton.tsx      # QR-code file upload trigger
│   ├── TableConfigDialog.tsx
│   └── ui/                     # Shared low-level UI atoms
├── contexts/
│   ├── FavoritesContext.tsx
│   ├── FieldNotificationContext.tsx
│   └── ViewModeContext.tsx
├── features/                   # Page-level feature modules
│   ├── admin/                  # User management, customer sites
│   ├── auth/                   # Login, ResetPassword
│   ├── customers/
│   ├── dashboard/              # Main dashboard (Phases 1–5)
│   ├── dispatch/               # Dispatch orders
│   ├── documents/              # Document library
│   ├── installations/          # Asset installation management
│   ├── issues/                 # Issues board (kanban / list)
│   ├── mobile-upload/          # Token-gated file upload (QR flow)
│   ├── profile/                # Profile wizard
│   ├── projects/               # Project list, detail, form
│   ├── settings/               # App settings (tabs)
│   ├── sign/                   # External signature page (public, no auth)
│   ├── sites/
│   ├── tips/                   # Tips & Tricks
│   └── workInstructions/       # Workflow builder + work order runner
├── hooks/
│   ├── useAuth.ts              # Current user + JWT-backed profile
│   ├── usePermissions.ts       # Role-based permission flags
│   ├── useActiveOffice.ts      # Regional office filter
│   ├── useDynamicFields.ts
│   ├── useFieldDefinitions.ts
│   ├── useOfflineTimeQueue.ts
│   ├── useTableConfig.ts
│   └── useAccessMode.ts        # View-only vs normal access mode
├── modules/
│   └── bom-project/            # BOM-to-Project module (feature-flagged)
│       ├── featureFlag.ts      # VITE_ENABLE_BOM_MODULE env var gate
│       ├── index.ts            # Public barrel export
│       ├── pages/              # BomDashboard, Upload, Mapping, Classification, Compare, Preview, Commit
│       ├── components/
│       ├── services/
│       ├── store/              # BomProjectContext (React Context)
│       ├── adapters/
│       ├── types/
│       └── utils/
├── services/                   # API service layer (one file per domain)
│   ├── api.ts                  # Axios instance (auto-detect base URL, JWT, view-only header)
│   └── [domain]Service.ts      # One per entity (see §3.3)
├── store/                      # Redux Toolkit slices
│   ├── index.ts
│   ├── projectSlice.ts
│   ├── installationSlice.ts
│   ├── customersSlice.ts
│   ├── productsSlice.ts
│   └── usersSlice.ts
├── types/                      # TypeScript interfaces (mirror backend DTOs)
├── data/                       # Static seed / reference data
├── onboarding/                 # What's new config
├── theme/                      # MUI theme tokens
└── utils/
```

### 3.2 Routes

| Path | Component | Auth | Notes |
|---|---|---|---|
| `/login` | `Login` | Public | |
| `/reset-password` | `ResetPassword` | Public | |
| `/sign/:tokenId` | `ExternalSignPage` | Public | Customer signature link |
| `/` | `Dashboard` | Required | Role-gated sections |
| `/projects` | `ProjectsPage` | Required | |
| `/projects/new` | `ProjectForm` | Required | |
| `/projects/:id` | `ProjectDetail` | Required | |
| `/projects/:id/edit` | `ProjectForm` | Required | |
| `/installations/assets` | `AssetInstallationPage` | Required | |
| `/work-instructions` | `WorkInstructions` | Required | |
| `/documents` | `DocumentsPage` | Required | |
| `/tips` | `TipsAndTricksPage` | Required | |
| `/admin` | `UserManagement` | Required | |
| `/admin/customers/:customerId/sites` | `CustomerSites` | Required | |
| `/issues` | `IssuesBoard` | Required | |
| `/settings` | `Settings` | Required | Blocked for `viewOnly` |
| `/profile` | `ProfileWizard` | Required | |
| `/admin/bom-project/*` | BOM module pages | Required | Only when `VITE_ENABLE_BOM_MODULE=true` |

### 3.3 Service layer

Each `[domain]Service.ts` wraps Axios calls to the API. The `api.ts` instance:
- Auto-detects `baseURL` from `VITE_API_BASE` env var, or derives `protocol://hostname:4000/api`
- Attaches `Authorization: Bearer <token>` from `localStorage`
- Performs silent JWT refresh 30 min before expiry
- Sends `X-View-Only: true` when the user switches into view-only access mode
- Timeout: 5 s default; auth endpoints override to no timeout

| Service file | Domain |
|---|---|
| `authService.ts` | Login, logout, token refresh |
| `projectService.ts` | Projects CRUD |
| `projectAssetService.ts` | Assets per project |
| `projectContactService.ts` | Contacts, delivery profiles, inbound items |
| `assetService.ts` | Global asset registry |
| `assetWorkflowRunService.ts` | Workflow run execution |
| `assetWorkflowAssignmentService.ts` | Asset ↔ workflow config assignments |
| `workflowConfigService.ts` | Workflow config (builder) |
| `workflowTypeService.ts` | Workflow types |
| `workflowTemplateService.ts` | Legacy templates |
| `workInstructionService.ts` | Work instructions |
| `workOrderService.ts` | Work orders |
| `issueService.ts` | Issues CRUD |
| `signatureService.ts` | Signature tokens & collection |
| `dispatchService.ts` | Dispatch orders |
| `documentService.ts` | Document library |
| `assetDocumentService.ts` | Asset-linked docs |
| `assetDocumentLinkService.ts` | Doc ↔ asset links |
| `installationService.ts` | Installation tabs/rows |
| `customerService.ts` | Customers |
| `siteService.ts` | Sites |
| `officesService.ts` | Offices / regions |
| `userService.ts` | Users admin |
| `settingsService.ts` | App settings |
| `brandSettingsService.ts` | Branding |
| `roleConfigService.ts` | Role permission config |
| `customFieldService.ts` | Dynamic custom fields |
| `fieldService.ts` | Field definitions |
| `dashboardService.ts` | Evidence completeness, workflow health |
| `divisionService.ts` | Divisions hierarchy |
| `productService.ts` | Products |
| `featureService.ts` | Features |
| `featureDependencyService.ts` | Feature dependencies |
| `quickbaseService.ts` | Quickbase integration |
| `globalSearchService.ts` | Global search |
| `searchIndexService.ts` | Document index status |
| `tableConfigService.ts` | Table column config |
### 3.4 State management

| Layer | Tool | Used for |
|---|---|---|
| Server state | React `useState` + service calls | Per-page data fetching |
| Global client state | Redux Toolkit | Projects, installations, customers, products, users |
| Auth | `localStorage` + `useAuth` hook | JWT token, user object |
| Role config | `localStorage` + API | RBAC permission flags |
| BOM module | React Context (`BomProjectContext`) | Multi-step BOM wizard state |

---

## 4. Web vs iOS — Platform Separation

The codebase uses **one shared React bundle** for both platforms. Platform differences are handled at three levels:

### 4.1 Build & distribution

| | Web | iOS |
|---|---|---|
| **Entry** | Vite dev server (`localhost:5173`) or static host | Capacitor copies `dist/` into the Xcode project as a local web asset |
| **API URL** | `http://<server>:4000/api` (LAN or hosted) | Same — configured via `VITE_API_BASE` or auto-detected from `window.location` |
| **Network** | HTTPS in production | iOS ATS (App Transport Security) allows LAN HTTP to `192.168.x.x` via `allow-network-access.ps1` |

### 4.2 Capacitor config (`capacitor.config.ts`)

```ts
appId: 'com.christianchavez.kinet'
appName: 'Kinet'
webDir: 'dist'         // Vite output dir bundled into iOS app
plugins:
  StatusBar:
    overlaysWebView: false
    style: DARK
    backgroundColor: '#0b1d24'
```

### 4.3 Runtime layout adaptation

There is **no `Capacitor.isNativePlatform()` guard** in the app source. Mobile vs desktop UI is driven purely by CSS breakpoints via MUI's `useMediaQuery`:

| Check | Breakpoint | Effect |
|---|---|---|
| `isMobile` | `theme.breakpoints.down("sm")` (< 600 px) | Card list views, full-screen dialogs, hidden table columns |
| `isMobile` | `theme.breakpoints.down("md")` (< 900 px) | Issues board switches to card layout |

### 4.4 iOS-specific UI elements (`AppShell`, `Topbar`)

| Component | Web | iOS (mobile breakpoint) |
|---|---|---|
| `AppShell` | Left sidebar visible | Sidebar hidden; **bottom tab bar** shown |
| `Topbar` | Standard MUI AppBar | iOS-style top bar with back/title/action layout |
| CSS | Normal viewport units | `env(safe-area-inset-*)` for notch/home-bar clearance, `100dvh` for dynamic viewport height |

### 4.5 Mobile-specific features

| Feature | File | Notes |
|---|---|---|
| QR code file upload | `MobileUploadPage`, `QRUploadButton` | Generates a token URL; phone browser opens upload page — no Capacitor required |
| View-only access mode | `AccessModeContext`, `Topbar`, `api.ts` | Switches the UI into view-only and sends a backend-enforced mutation block header |
| Search index status | `Topbar`, `searchIndexService` | Admin-only status/rebuild control for document indexing |

---

## 5. Backend — `server/Commtrac.Api/`

### 5.1 Technology

| | |
|---|---|
| Framework | ASP.NET Core 8 (minimal host) |
| ORM | Entity Framework Core 8 |
| Database | SQLite (`commtrac.db`) |
| Auth | JWT Bearer tokens (HS256, 720 min expiry) |
| Docs | Swagger / OpenAPI at `/swagger` (dev only) |
| Port | 4000 |

### 5.2 Middleware pipeline

```
CORS (frontend policy: localhost + 10.x + 192.168.x + any IP)
→ Authentication (JWT Bearer)
→ Authorization
→ Controllers
```

### 5.3 Controllers & API routes

| Controller | Base path | Key operations |
|---|---|---|
| `AuthController` | `/api/auth` | login, logout, refresh, invite, reset-password, 2FA |
| `UsersController` | `/api/users` | CRUD users, role assignment |
| `ProjectsController` | `/api/projects` | CRUD projects, clone, workload |
| `ProjectAssetsController` | `/api/project-assets` | CRUD assets per project, bulk import |
| `ProjectContactsController` | `/api/project-contacts` | Contacts per project |
| `ProjectDeliveryProfilesController` | `/api/project-delivery-profiles` | Delivery addresses |
| `ProjectInboundItemsController` | `/api/project-inbound-items` | Inbound parts/warranty |
| `AssetsController` | `/api/assets` | Global asset registry |
| `AssetWorkflowRunsController` | `/api/asset-workflow-runs` | Start/step/complete workflow runs |
| `AssetWorkflowAssignmentsController` | `/api/asset-workflow-assignments` | Asset ↔ config assignments |
| `WorkflowConfigsController` | `/api/workflow-configs` | Workflow config CRUD (builder) |
| `WorkflowTypesController` | `/api/workflow-types` | Workflow types |
| `WorkflowTemplatesController` | `/api/workflow-templates` | Legacy templates |
| `WorkInstructionsController` | `/api/work-instructions` | Work instructions |
| `WorkInstructionTemplatesController` | `/api/work-instruction-templates` | WI templates |
| `WorkOrdersController` | `/api/work-orders` | Work orders |
| `IssuesController` | `/api/issues` | Issues CRUD, comments, escalation |
| `SignatureTokensController` | `/api/signature-tokens` | Generate / validate signature tokens |
| `SignatureEventsController` | `/api/signature-events` | Signature event log |
| `PublicSignController` | `/api/public/sign` | Public (no-auth) signature submission |
| `DispatchOrdersController` | `/api/dispatch-orders` | Dispatch CRUD |
| `DocumentsController` | `/api/documents` | Document library |
| `AssetDocumentsController` | `/api/asset-documents` | Asset-linked documents |
| `AssetDocumentLinksController` | `/api/asset-document-links` | Doc ↔ asset link management |
| `InstallationsController` | `/api/installations` | Installation tab data |
| `InstallationTabsController` | `/api/installation-tabs` | Installation tab config |
| `InstallationTabRowsController` | `/api/installation-tab-rows` | Tab row data |
| `CustomersController` | `/api/customers` | Customer CRUD |
| `SitesController` | `/api/sites` | Site CRUD |
| `OfficesController` | `/api/offices` | Offices / regions |
| `AdminController` | `/api/admin` | Admin utilities |
| `AdminTabsController` | `/api/admin-tabs` | Admin tab config |
| `AdminTabRowsController` | `/api/admin-tab-rows` | Admin tab row data |
| `SettingsController` | `/api/settings` | App settings |
| `BrandSettingsController` | `/api/brand-settings` | Branding |
| `RoleConfigsController` | `/api/role-configs` | Role permission config |
| `CustomFieldsController` | `/api/custom-fields` | Dynamic custom fields |
| `FieldDefinitionsController` | `/api/field-definitions` | Field definition registry |
| `FieldValuesController` | `/api/field-values` | Dynamic field values |
| `TableConfigsController` | `/api/table-configs` | Table column config |
| `DivisionsController` | `/api/divisions` | Division hierarchy |
| `ProductsController` | `/api/products` | Products |
| `FeaturesController` | `/api/features` | Features |
| `FeatureDependenciesController` | `/api/feature-dependencies` | Feature dependencies |
| `WorkflowConfigFeaturesController` | `/api/workflow-config-features` | Workflow ↔ feature links |
| `BomImportRunsController` | `/api/bom-import-runs` | BOM import sessions |
| `QuickbaseDiscoveryController` | `/api/quickbase/discovery` | QB field discovery |
| `QuickbaseGoodsMovementsController` | `/api/quickbase/goods-movements` | QB sync |
| `MobileUploadController` | `/api/mobile-upload` | QR token + file upload |
| `SearchController` | `/api/search` | Global search |
| `DashboardController` | `/api/dashboard` | Evidence completeness, workflow health |
| `HealthController` | `/api/health` | Liveness probe |

### 5.4 Services

| Service | Purpose |
|---|---|
| `EmailService` (SMTP) | Invite emails, reset links |
| `SmsService` | SMS notifications (provider-agnostic) |
| `NotificationService` | Orchestrates email + SMS |
| `NotificationSettingsService` | Per-user notification preferences |
| `DocumentContentSearchService` | Full-text extraction from uploaded docs |
| `DocumentSearchIndexWorker` | Background hosted service: indexes docs |
| `DocumentSearchIndexQueue` | Channel-based queue for indexing jobs |

---

## 6. Database — SQLite

**File:** `server/Commtrac.Api/commtrac.db`

### 6.1 Migration timeline

| Date | Migration | Key tables added |
|---|---|---|
| 2026-01-29 | `InitialCreate` | Users, Projects, Installations, Customers |
| 2026-01-29 | `PasswordResetTokens` | PasswordResetTokens |
| 2026-02-02 | `InstallationModule` | InstallationAssets |
| 2026-02-02 | `FileUploadsAndNotifications` | Documents, Notifications |
| 2026-02-02 | `DynamicFields` | FieldDefinitions, FieldValues |
| 2026-02-02 | `DynamicFieldsTables` | Table-level field config |
| 2026-02-03 | `AdminTabs` | AdminTabs |
| 2026-02-03 | `InstallationTabs` | InstallationTabs |
| 2026-02-03 | `InstallationTabRows` | InstallationTabRows |
| 2026-02-03 | `AdminTabRows` | AdminTabRows |
| 2026-02-03 | `FieldDefinitionLinkActions` | LinkActions on fields |
| 2026-02-05 | `AddTableConfigs` | TableConfigs |
| 2026-02-05 | `AddAssetsAndRoleConfigs` | Assets, RoleConfigs |
| 2026-02-05 | `AddCustomerSites` | Sites |
| 2026-02-06 | `AddCustomerLogoFields` | Customer logo columns |
| 2026-02-07 | `AddWorkInstructions` | WorkInstructions, WorkInstructionTemplates |
| 2026-02-08 | `AddWorkflowTemplates` | WorkflowTemplates |
| 2026-02-10 | `WorkflowConfig` | WorkflowConfigs, WorkflowTypes |
| 2026-02-14 | `AssetWorkflowRuns` | AssetWorkflowRuns, AssetWorkflowAssignments |
| 2026-02-17 | `WorkflowRunIssues` | RunIssues |
| 2026-02-18 | `WorkOrders` | WorkOrders |
| 2026-02-20 | `Issues` | Issues |
| 2026-02-26 | `SignatureTokens` | SignatureTokens |
| 2026-03-08 | `ProjectContactsAndDelivery` | ProjectContacts, ProjectDeliveryProfiles, ProjectInboundItems |
| 2026-03-08 | `SignatureEvents` | SignatureEvents |
| 2026-03-08 | `Dispatch` | DispatchOrders |
| 2026-03-08 | `BackfillSignatureStatus` | Backfill column |
| 2026-03-09 | `ContactAddress` | Address fields on Contact |
| 2026-03-10 | `QuickbaseGoodsMovements` | QuickbaseGoodsMovements |
| 2026-03-11 | `QbOrderRefFid` | QB order ref FID column |
| 2026-03-11 | `ProjectPurchaseOrderNumber` | PO number on Project |
| 2026-03-14 | `ProjectAssetInstallationFields` | As-built fields on Assets |
| 2026-03-15 | `ProjectAssetAsBuiltJson` | JSON blob for as-built data |
| 2026-03-15 | `AssetWorkflowRunBomActualJson` | BOM actual JSON on runs |
| 2026-03-17 | `Divisions` | Divisions |
| 2026-03-17 | `Features` | Features |
| 2026-03-17 | `FeatureDependencies` | FeatureDependencies |
| 2026-03-17 | `WorkflowConfigFeatures` | WorkflowConfigFeatures (join) |
| 2026-03-18 | `FeatureInventoryFields` | Inventory fields on Features |
| 2026-03-19 | `BomModule` | BomImportRuns, BomImportItems |
| 2026-03-20 | `ProjectOfficeId` | OfficeId FK on Projects |
| 2026-03-21 | `FeatureProcurementFields` | Procurement fields on Features |

### 6.2 Core domain entities

| Entity | Table | Key relationships |
|---|---|---|
| `UserEntity` | Users | → Office |
| `ProjectEntity` | Projects | → Customer, Office |
| `ProjectAssetEntity` | ProjectAssets | → Project |
| `ProjectContactEntity` | ProjectContacts | → Project |
| `ProjectDeliveryProfileEntity` | ProjectDeliveryProfiles | → Project |
| `ProjectInboundItemEntity` | ProjectInboundItems | → Project |
| `WorkflowConfigEntity` | WorkflowConfigs | Draft → Published → Archived |
| `WorkflowTypeEntity` | WorkflowTypes | Pre-seeded + user-managed |
| `AssetWorkflowAssignmentEntity` | AssetWorkflowAssignments | Asset ↔ WorkflowConfig ↔ WorkflowType |
| `AssetWorkflowRunEntity` | AssetWorkflowRuns | Snapshot of config at run start |
| `IssueEntity` | Issues | → Asset, Project, Run |
| `SignatureTokenEntity` | SignatureTokens | → Run |
| `SignatureEventEntity` | SignatureEvents | → Token |
| `DispatchOrderEntity` | DispatchOrders | → Project, Asset |
| `DocumentEntity` | Documents | → Project, Asset |
| `DivisionEntity` | Divisions | Self-referential hierarchy |
| `ProductEntity` | Products | → Division |
| `FeatureEntity` | Features | → Product |
| `FeatureDependencyEntity` | FeatureDependencies | → Feature (from/to) |
| `BomImportRunEntity` | BomImportRuns | → Project |
| `BomImportItemEntity` | BomImportItems | → BomImportRun |
| `CustomerEntity` | Customers | |
| `SiteEntity` | Sites | → Customer |
| `OfficeEntity` | Offices | |

---

## 7. API Protocol

### 7.1 Auth flow

```
POST /api/auth/login  { email, password }
  → 200 { token: "eyJ...", user: { id, email, fullName, role, office } }

Authorization: Bearer <token>   (on all subsequent requests)

POST /api/auth/refresh  { token }
  → 200 { token: "eyJ..." }    (silent refresh 30 min before expiry)
```

### 7.2 Roles & permissions

| Role | Capabilities |
|---|---|
| **Admin** | Full access, user management, settings |
| **Project Manager** | Full project/asset/workflow access, dashboard health cards |
| **Engineer** | Own assigned jobs only, no settings, no admin |
| **Viewer** | Read-only, no settings |

Permissions configurable per role via `RoleConfigs` table.

### 7.3 HTTP conventions

- All endpoints return JSON
- `GET` — list or single resource
- `POST` — create
- `PUT` — full update
- `PATCH` — partial update (asset status, step completion)
- `DELETE` — soft or hard delete depending on entity
- `422 Unprocessable Entity` — business rule violation (e.g. completing a run with unresolved blocking issues)
- `401 Unauthorized` — invalid/expired token → frontend redirects to `/login`
- `403 Forbidden` — insufficient role

### 7.4 File uploads

- `multipart/form-data` on document and mobile-upload endpoints
- Files stored in `server/Commtrac.Api/Storage/`

---

## 8. Request & Access Architecture

The current app no longer uses the older IndexedDB/offline queue design. Runtime access now flows through `useAuth`, `AccessModeContext`, `api.ts`, `ViewOnlyEnforcementFilter`, and `AccessScopeServices`, with the backend enforcing scoped visibility and view-only mutation blocking.

```
┌─────────────────────────────────────────────────────┐
│  React app (web or iOS)                             │
│                                                     │
│  api.ts (Axios)                                     │
│   ├─ Request interceptor: attach JWT                │
│   ├─ Response interceptor: cache GET in IndexedDB   │
│   └─ On network fail: serve cached response          │
│                                                     │
│  useSyncEngine                                      │
│   ├─ Online/offline detection                       │
│   ├─ queueOrSend(): write online → immediate POST   │
│   │                 write offline → IndexedDB queue  │
│   ├─ Flush on reconnect / tab visibility            │
│   └─ SyncStatusBadge: amber dot in Topbar           │
│                                                     │
│  localDB.ts (IndexedDB via idb)                     │
│   ├─ cache          – GET response snapshots        │
│   ├─ pending_actions– queued writes                 │
│   └─ sync_meta      – last sync timestamps          │
└─────────────────────────────────────────────────────┘
```

---

## 9. Feature Flags

| Flag | How set | Effect |
|---|---|---|
| `VITE_ENABLE_BOM_MODULE=true` | `.env` file | Shows BOM module routes and sidebar item |
| `VITE_API_BASE=http://...` | `.env` file | Override API base URL (useful for iOS pointing at specific server) |

---

## 10. Key External Integrations

| Integration | Purpose | Location |
|---|---|---|
| **Quickbase** | Goods movements sync, field discovery | `QuickbaseGoodsMovementsController`, `QuickbaseDiscoveryController` |
| **SMTP** | Invite & reset emails | `EmailService`, configured in `appsettings.json` |
| **SMS** | Notifications | `SmsService`, provider-agnostic API key |
| **Capacitor iOS** | Native iOS packaging | `capacitor.config.ts`, `ios/` |

---

## 11. Development Setup

```bash
# Frontend (port 5173)
npm install
npm run dev

# Backend (port 4000)
cd server/Commtrac.Api
dotnet run

# iOS (after changes to src/)
npm run build          # compile to dist/
npx cap sync ios       # copy dist/ into Xcode project
# → open ios/App/App.xcodeproj in Xcode and run on simulator/device
```

**Environment variables (`.env`):**
```
VITE_API_BASE=http://10.7.15.51:4000/api   # server LAN IP
VITE_ENABLE_BOM_MODULE=true                    # enable BOM module
```
