# Mobile Agent — Master Prompt
## Kinet App · iOS & Android · Capacitor 8

---

## YOUR ONLY JOB

Bring the Capacitor mobile app (iOS + Android) up to date with recent feature work done on the Windows PC. You are working on the **Mac**.

**STRICT BOUNDARIES — do NOT touch any of these:**
- `server/` directory — any C#/.NET backend code
- Any `.cs`, `.csproj`, `.sln` file
- Any endpoint, DTO, migration, or database schema
- Web browser UI layout, page structure, or desktop-only flows
- Routing logic in `src/app/routes.tsx` (already updated)
- Any file not directly related to mobile/Capacitor behaviour

If a change seems needed in a server file or a purely web UI file, **stop and document it** instead of making the change.

---

## SETUP — DO THIS FIRST

```bash
# 1. Make sure you are on the right branch and have the latest
git fetch origin
git checkout codex/workflow-inspection-reaudit
git pull origin codex/workflow-inspection-reaudit

# 2. Install dependencies (package.json was updated on Windows)
npm install

# 3. Build the web bundle
npm run build

# 4. Sync web bundle + plugins into native projects
npx cap sync ios
npx cap sync android

# 5. TypeScript check — fix anything that fails before opening Xcode/Android Studio
npx tsc --noEmit
```

> **WARNING:** If you have any local uncommitted changes on this branch from previous Mac work, stash them first:
> `git stash` then after pulling do `git stash pop` and carefully resolve only mobile-relevant conflicts.
> Do NOT accept any stash changes that touch `server/` or core web UI files.

---

## WHAT CHANGED ON WINDOWS (features to review & test on mobile)

### 1. Canonical `InspectionImport` type — BREAKING for mobile code
The `InspectionImport` type was completely replaced. Any mobile code referencing the old fields must be updated:

| Old field (deleted) | New field |
|---|---|
| `fileName` | *(removed — use `id`)* |
| `uploadedBy` | *(removed)* |
| `errorText` | `error` |
| `assetId` | `projectAssetId` |
| `contentHash` | `hash` |

Type is now in `src/types/inspectionImport.ts` (not `src/types/project.ts`).
Service is `src/services/inspectionImportService.ts` — new methods:
- `create(input)` — POST canonical JSON
- `listByProject(projectId, params?)` — GET by project
- `assign(id, { projectId, projectAssetId })` — assign to asset
- `archive(id, { reason?, archiveRef? })` — archive import
- `listByProjectIncludeArchived(projectId, assetId?)` — include archived

### 2. `ProjectInspectionInboxPage` — new page (already in routes)
- File: `src/features/projects/ProjectInspectionInboxPage.tsx`
- Displayed as the "Inspection Inbox" tab inside a project
- Check if this needs any Capacitor-specific adaptations (file picker, camera for upload)

### 3. `InspectionsTab.tsx` — already uses Capacitor Camera
- File: `src/features/projects/InspectionsTab.tsx`
- Uses `@capacitor/camera` and `Capacitor.isNativePlatform()`
- Already mobile-aware — verify it still works after the sync

### 4. `WorkflowMode` — projects now have explicit modes
- `INSTALLATION_ONLY` | `INSPECTION_ONLY` | `MIXED`
- `ProjectDetail` tabs change based on this — "Inspection Inbox" tab only shows for inspection-enabled projects
- Check the mobile bottom nav / project detail flow respects this

### 5. `InspectionInboxTab.tsx` — updated field names
- File: `src/features/projects/InspectionInboxTab.tsx`
- Uses updated `InspectionImport` fields (see table above)
- Upload still uses `api.post("/inspection-imports/upload", formData)` — verify this endpoint exists or update to use `inspectionImportService.create()`

### 6. Dashboard "My Inspections" panel
- File: `src/features/dashboard/Dashboard.tsx`
- New `PmDashboardTab` with "My Inspections" tab
- Navigates to `/projects/:id/assets/:assetId/inspections` — verify deep link works on mobile

### 7. Analytics service
- File: `src/services/analyticsService.ts`
- Lightweight event tracking — verify it doesn't block on mobile / handles offline gracefully

### 8. `ProjectInspectionsPage` — DELETED
- This page is gone. Route `/projects/:id/inspections` now redirects to `/projects/:id`
- Remove any mobile deep links or navigation that pointed to `/projects/:id/inspections`

---

## EXISTING MOBILE INFRASTRUCTURE (already working — do not break)

### Capacitor plugins installed
```
@capacitor/core ^8
@capacitor/ios ^8
@capacitor/android ^8
@capacitor/camera ^8
@capacitor/filesystem ^8
@capacitor/network ^8
@capacitor/status-bar ^8
capacitor-native-biometric ^4
capacitor-secure-storage-plugin ^0.13
```

### iOS SPM shims
- `ios/App/CapApp-SPM/Package.swift` — all plugins registered
- `ios/App/App/AppDelegate.swift` — standard Capacitor delegate
- Do NOT regenerate this file — the SPM setup has a custom shim for `capacitor-native-biometric`

### Key mobile services
| File | Purpose |
|---|---|
| `src/services/secureStorage.ts` | iOS Keychain / Android Keystore wrapper |
| `src/services/biometricAuth.ts` | Face ID / Touch ID / PIN gate |
| `src/services/networkService.ts` | Capacitor Network plugin wrapper |
| `src/components/BiometricLockScreen.tsx` | Lock screen shown on app resume |

### App boot flow
`main.tsx` → `App.tsx` (calls `initSecureStorage()`) → `BiometricLockScreen` (on native) → main app

### capacitor.config.ts
```ts
{
  appId: 'com.christianchavez.kinet',
  appName: 'Kinet',
  webDir: 'dist',
  plugins: { StatusBar: { style: 'DARK', backgroundColor: '#0b1d24' }, Camera: {} }
}
```

---

## TASKS — IN ORDER

1. **Pull & sync** (see Setup above)
2. **TypeScript check** — `npx tsc --noEmit` — fix any errors, do NOT touch server code
3. **Grep for old InspectionImport fields** in any mobile-specific files:
   ```
   grep -r "\.fileName\|\.uploadedBy\|\.errorText\|\.assetId\|\.contentHash" src/ --include="*.tsx" --include="*.ts"
   ```
   Fix any hits by updating to the new field names.
4. **Check `InspectionInboxTab.tsx` upload** — the `api.post("/inspection-imports/upload")` endpoint was removed from the backend. Update to use `inspectionImportService.create({ rawJson: fileContent, projectId, source })` by reading the file as text first.
5. **Test on iOS Simulator** — open Xcode: `npx cap open ios`
   - Biometric lock screen (use Face ID simulator)
   - Login flow online + offline grace
   - Dashboard tabs including "My Inspections"
   - Project detail → Inspection Inbox tab
   - Camera capture in InspectionsTab
6. **Test on Android Emulator** — `npx cap open android`
   - Same flows as iOS
   - Verify secure storage (EncryptedSharedPreferences)
7. **Commit only mobile changes**, push to same branch `codex/workflow-inspection-reaudit`

---

## WHAT TO REPORT BACK

After completing, document:
- Any TypeScript errors found and how they were fixed
- Any Capacitor plugin version mismatches
- Any mobile-specific issues found during simulator testing
- Any server API calls that appear broken from the mobile side (document only, don't fix server)
- Whether `npx cap sync` completed cleanly for both iOS and Android

---

## CRITICAL WARNINGS

1. **Do not run `npx cap add ios` or `npx cap add android`** — native projects already exist
2. **Do not run `npm run build` and commit the `dist/` folder** — dist is gitignored
3. **The Mac may have changes in `codex/workflow-inspection-reaudit` that conflict with Windows changes.** If you get merge conflicts, always prefer the Windows version for server files and service files. For mobile-specific files (`BiometricLockScreen`, `secureStorage`, `biometricAuth`, `networkService`, `main.tsx`), carefully merge both sides.
4. **Do not upgrade Capacitor versions** — stay on ^8 throughout
5. **Do not modify `ios/App/CapApp-SPM/Package.swift`** unless a plugin was explicitly added to `package.json`
