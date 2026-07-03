# CI/CD Standards

> **Applied:** `.github/workflows/ci.yml` now exists with `frontend`, `backend`,
> `standards`, and `e2e` jobs (built from the verified gates). `.githooks/pre-push`
> runs the fast gates locally. The tracked `.db` backups were untracked and
> `.gitignore` broadened. What's left is **branch protection** (a GitHub UI/admin
> step) and burning down the lint backlog before making lint a required check.

**Original starting position: no CI at all.** The pipeline below is the one that
was installed; the sections after it (hooks, branch protection, releases) are the
remaining rollout guidance. Enabling *required* checks changes merge behavior —
coordinate with the repo owner first.

## The pipeline stages (mirror `check-gates.mjs`)

The local gate runner and CI must run the same commands, so "green locally" means
"green in CI". Stages:

1. **frontend** — `npm ci` → `npm run build` (`tsc -b` typecheck + vite bundle).
2. **backend** — `dotnet build` in `server/Commtrac.Api` (nullable-enabled = the check).
3. **docs-fresh** — regenerate `docs/ARCHITECTURE.md`, fail if content changed
   (someone edited routes/controllers without regenerating).
4. **hygiene** — fail if `.db`/`.log`/`dist`/`tempbuild` artifacts are tracked.
5. *(add once seeded)* **test** — `vitest run --coverage` + `dotnet test` + Playwright e2e.

## Drop-in workflow

The version below is the minimal illustration. The **actually installed**
`.github/workflows/ci.yml` is a superset — it also runs `npm test`, `dotnet test`,
a `continue-on-error` lint step, and a Playwright `e2e` job. Read the real file
for the current pipeline. Every command was run successfully in this repo (Node 24
/ .NET 8):

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build            # tsc -b (the only typecheck) + vite bundle
      # - run: npx vitest run --coverage   # enable once specs exist (see testing.md)

  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'
      - run: dotnet build --nologo
        working-directory: server/Commtrac.Api
      # - run: dotnet test   # enable once the test project exists

  standards:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      # docs + hygiene gates via the committed runner
      - run: node .claude/skills/enterprise-dev-practices/scripts/check-gates.mjs docs hygiene
```

> The `hygiene` gate passes now (the tracked `.db` backups were untracked and
> `.gitignore` broadened). The lint step is `continue-on-error` until the 13
> error-level findings are burned down — see the SKILL.md lint note.

## Pre-commit / pre-push hooks

`.githooks/pre-commit` stays lightweight (regenerates `docs/ARCHITECTURE.md`).
The heavier gates run in **`.githooks/pre-push`** (already installed):

```sh
# .githooks/pre-push  (installed)
#!/bin/sh
set -e
node .claude/skills/enterprise-dev-practices/scripts/check-gates.mjs typecheck backend docs hygiene
```

`scripts/install-githooks.mjs` already points `core.hooksPath` at `.githooks`, so
a new hook file there is picked up automatically on the next `npm install`.

## Branch protection (the remaining step — a GitHub admin action)

Once CI has run green on a PR, in the repo's GitHub settings:

- Require the `frontend`, `backend`, `standards`, and `e2e` checks before merge.
- Require a PR + at least one review; no direct pushes to `main`.
- Require the branch to be up to date before merge.
- Require a coverage floor once `vitest --coverage` / `dotnet test` are enforced.

This can't be done from the working tree — it's a GitHub UI/API step for a repo
admin, so it's the one CI item left to you.

## Hygiene (done)

The tracked SQLite backups were untracked and `.gitignore` was broadened to
`server/**/commtrac.*.db*` (+ `-shm`/`-wal` and `*.Tests/**/*.db*`). The `hygiene`
gate is green; keep it that way — never `git add` a `.db`/`.log`/`dist` artifact.

## Releases & versioning

- `package.json` is at `0.1.0`; mobile ships via Capacitor from the same `dist/`.
- Adopt **SemVer** and tag releases (`v0.1.0`). A release = a Playwright smoke
  pass (login → project → workflow run) + `npm run build --full` clean +
  `dotnet build` clean.
- Mobile release builds need `VITE_API_BASE` set to a reachable host (native
  **cannot** reach `localhost`) — set it in CI secrets / `.env.production.local`,
  never commit device IPs.
- EF migrations apply automatically on API startup; a release that adds a
  migration should be smoke-tested against a **copy** of prod data first, because
  `DbInitializer` also runs `Ensure*`/`Fix*` patches on boot.
