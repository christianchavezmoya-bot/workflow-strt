# Mobile build and deployment

Capacitor wraps the same Vite `dist/` bundle for Android and iOS. Native projects live in `android/` and `ios/`.

## Prerequisites

- Node 24+ and `npm ci` at repo root
- API reachable from devices (`VITE_API_BASE` — **HTTPS for store builds**)
- **Android:** JDK + Android SDK — run `source scripts/android-env.sh` before Gradle (aligns with Android Studio)
- **iOS:** macOS + Xcode (Archive requires Apple signing)

## Version numbers (keep in sync)

| Location | Field | Purpose |
|---|---|---|
| `package.json` | `version` | Web + product semver |
| `android/app/build.gradle` | `versionName` | User-visible Android version |
| `android/app/build.gradle` | `versionCode` | Monotonic integer for Play Store |
| `ios/.../project.pbxproj` | `MARKETING_VERSION` | User-visible iOS version |
| `ios/.../project.pbxproj` | `CURRENT_PROJECT_VERSION` | Build number |

Sync from repo root:

```bash
# Set semver and sync Android/iOS marketing version
node scripts/sync-version.mjs 0.2.0

# Also bump Android versionCode + iOS build number (every store upload)
node scripts/sync-version.mjs 0.2.0 --bump-code
```

## Build steps (every phone release)

```bash
# 1. Production API URL (never localhost on device)
export VITE_API_BASE=https://api.yourdomain.com/api

# 2. Web bundle
npm run build

# 3. Copy into native shells
npx cap sync

# 4. Android debug (field pilot)
source scripts/android-env.sh
cd android && ./gradlew assembleDebug

# 5. Android release (store / MDM)
cd android && ./gradlew assembleRelease
# or bundleRelease for Play Store AAB

# 6. iOS — open Xcode
# ios/App/App.xcodeproj → Product → Archive → Distribute
```

## Pre-build checklist

- [ ] `VITE_API_BASE` points to production **HTTPS** API
- [ ] For store builds: disable Capacitor cleartext (`capacitor.config.ts` — use HTTPS scheme)
- [ ] Version synced (`scripts/sync-version.mjs`) with `--bump-code` for store uploads
- [ ] `docs/RELEASE_CHECKLIST.md` offline section passed on a physical device
- [ ] Signing: Android keystore / iOS provisioning profiles valid

## Distribution

| Channel | When |
|---|---|
| MDM / sideload APK | Enterprise field fleet |
| Play Internal testing | Android pilot |
| TestFlight | iOS pilot |
| Production store | General rollout — use staged percentage |

## Phone upgrade notes

- Updating the app replaces the bundled `dist/`; **IndexedDB, sync queue, and secure storage persist** on the same app id.
- After an app update, verify pending offline work still syncs (see release checklist).
- If API schema changed, deploy API to staging first, then ship the matching phone build.

## Rollback

- MDM: push previous APK/IPA version
- Store: halt rollout and promote previous release in console
- Users with pending sync: advise opening Sync Center before uninstalling

See also: `docs/RELEASE_CHECKLIST.md`, `docs/BUG_TRIAGE.md`.
