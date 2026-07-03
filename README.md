# workflow-strt

## Docs

Architecture documentation is generated from the current app structure.

```bash
npm run docs:update
```

This repo also uses a pre-commit hook to refresh `docs/ARCHITECTURE.md` before each commit.
If hooks are not active in your local clone, run:

```bash
npm run hooks:install
```

## Android Terminal Setup

Use the helper script before Gradle or ADB commands so Terminal uses the same JDK and SDK as Android Studio:

```bash
source scripts/android-env.sh
cd android
./gradlew assembleDebug
```

For LAN-based mobile testing, keep committed env files generic and set the device API host locally in an untracked override such as `.env.production.local`:

```bash
VITE_API_BASE=http://192.168.1.102:4000/api
```
