# Mac agent — Docker cleanup before any rebuild (mandatory)

**Use this block at the start of every Mac/Claude Code session that runs `docker build`, `docker compose … --build`, or repeated large `npm run build` after Docker failures.**

Copy the **PROMPT START … PROMPT END** section into other prompts, or tell Claude: *“Run Step 0 from `docs/MAC_AGENT_DOCKER_CLEANUP_BEFORE_REBUILD.md` first.”*

**Also applies when:** build fails with `no space left on device`, `ENOSPC`, Docker “not enough memory”, or `Cannot allocate memory`.

---

## PROMPT START — Docker / disk cleanup (run first, repeat if build fails)

You are about to rebuild. **Do not run `docker build` or a full stack standup until this cleanup passes.**

Christian’s Mac often has **Docker disk/memory full**. Free space **before every rebuild attempt** and **again immediately** if any build fails mid-run.

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

echo "=== disk BEFORE cleanup ==="
df -h / | tail -1

echo "=== docker disk BEFORE cleanup ==="
docker system df 2>/dev/null || echo "(docker not running)"

# Stop local staging stack if running (safe — AWS staging is separate)
docker compose -f docker-compose.staging.yml down 2>/dev/null || true

# Reclaim Docker disk: stopped containers, unused networks, dangling images, build cache
docker system prune -af 2>/dev/null || true
docker builder prune -af 2>/dev/null || true

# Optional: remove old Commtrac staging volumes only (not AWS/RDS data)
for v in $(docker volume ls -q 2>/dev/null | grep -E 'commtrac|staging' || true); do
  docker volume rm "$v" 2>/dev/null || true
done

# Free npm/vite build artifacts (often several GB)
rm -rf dist node_modules/.vite 2>/dev/null || true
npm cache clean --force 2>/dev/null || true

echo "=== disk AFTER cleanup ==="
df -h / | tail -1

echo "=== docker disk AFTER cleanup ==="
docker system df 2>/dev/null || true
```

### PASS criteria (do not skip)

| ID | PASS if |
|----|---------|
| **D1** | At least **8 GB free** on `/` (`df -h /`). If below 8 GB: Docker Desktop → Troubleshoot → **Clean / Purge data**, empty Trash, remove unused Xcode simulators, then re-run cleanup |
| **D2** | `docker system df` — **Build Cache** not in the multi‑GB range after prune (some MB is OK) |
| **D3** | No `docker build` started until D1 passes |

### If a build still fails on space/memory

1. Run the **entire cleanup block again** (do not retry build blindly).
2. Remove the failed image tag if partial: `docker rmi commtrac-api:staging 2>/dev/null || true`
3. Re-check D1, then retry **one** build.

### Rules

- **Never restart Docker Desktop** (quit, kill -9, force relaunch) unless Christian **explicitly** asks. On large Docker VMs, `docker info` can take many minutes while starting — report “not responding yet” and **wait**; do not treat slow as stuck.
- **Read-only Docker checks** (`docker system df`, `docker ps`) must use a timeout; if they hang, **stop and report** — do not restart the daemon to “fix” it.
- **Always** cleanup before: `docker build`, ECR push prep, `./scripts/standup-staging.sh --build-web`, fresh Docker Postgres standup.
- **Repeat** cleanup after any failed `docker build` or `npm run build` with ENOSPC.
- **Do not** run `docker system prune` while Christian is actively testing a local stack **unless** the prompt says to stand down first (this block stops staging compose first).
- **AWS-only phone/web testing** (no local compose): use [`MAC_AGENT_AWS_STAGING_PHONE_WEB_TEST_PROMPT.md`](./MAC_AGENT_AWS_STAGING_PHONE_WEB_TEST_PROMPT.md) — **npm builds only, no Docker prune/restart**.
- Report **disk before/after** in your session report (`df -h /` one line each).

## PROMPT END

---

## Prompts that must include this block

| Prompt | Why |
|--------|-----|
| [`MAC_AGENT_AWS_STAGING_REBUILD_PROMPT.md`](./MAC_AGENT_AWS_STAGING_REBUILD_PROMPT.md) | API `docker build` + web `npm run build` |
| [`MAC_AGENT_AWS_STAGING_PHONE_WEB_TEST_PROMPT.md`](./MAC_AGENT_AWS_STAGING_PHONE_WEB_TEST_PROMPT.md) | Phone reinstall + web verify — **no Docker** |
| [`MAC_AGENT_DOCKER_STAGING_PROMPT.md`](./MAC_AGENT_DOCKER_STAGING_PROMPT.md) | Full local Docker staging standup |
| [`MAC_AGENT_FRESH_DOCKER_STANDUP_PROMPT.md`](./MAC_AGENT_FRESH_DOCKER_STANDUP_PROMPT.md) | Fresh Postgres volume standup |
| [`CLAUDE_CODE_AWS_HANDOFF.md`](./CLAUDE_CODE_AWS_HANDOFF.md) | ECS deploy workflow (step 0) |
| Any future prompt with **`docker build`** or **`--build-web`** | Same cleanup |

**iOS-only rebuild** (`npm run build:cloud-native` without Docker): cleanup optional but run `rm -rf dist node_modules/.vite` if disk is low.
