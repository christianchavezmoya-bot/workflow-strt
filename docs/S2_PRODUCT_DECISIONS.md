# S2 — Product decisions register

Stage **S2** of [`EXCELLENCE_PROGRAMME.md`](./EXCELLENCE_PROGRAMME.md). Three questions only a product
owner can answer — recorded here so later stages do not rediscover them.

**Status:** complete (2026-08-17). Decisions below unblock S3 (tests) and S9 (dependency ladder).

| # | Question | Verdict | Next action |
|---|---|---|---|
| 1 | Workflow-builder product-features picker | **Retired deliberately** | Delete dead code in S8 |
| 2 | `xlsx` / SheetJS security advisories | **Accept contained risk until S9** | Migrate parse path in S9 |
| 3 | `[AllowAnonymous]` endpoints | **All intentional** (see audit) | No change; optional S6 hardening for offices |

---

## 1. Workflow-builder product-features picker

### What it is

In `WorkflowBuilder.tsx`, the “Add an input” dialog contains a product-features checkbox list
behind `{false && productFeatures.length > 0 && (` (~55 lines). It would let an admin pick
installed product features and bulk-add them as step inputs.

### Evidence

Git history shows the picker was **disabled in the same commit that replaced it**, not left behind
by accident:

```
661d98a (2026-03-15) chore: restore point — workflow builder auto-populate + step type system
  - Step type dropdown on every step with auto-populate templates
  - buildAutoSteps: generates full standard workflow from feature qty
  - Removed "From features" buttons from Inputs and Capture tabs
```

The `{false && …}` block is the old “From features” UI, switched off when the step-type system
shipped. Feature-driven workflow generation still exists via:

- **Installed Features panel** (checkboxes + qty steppers, ~line 1162)
- **`buildAutoSteps`** — auto-generates steps from feature selections
- **Step type dropdown** — per-step templates

Users are **not** missing functionality; they use the newer path.

### Decision

| Field | Value |
|---|---|
| **Verdict** | Deliberately retired — dead code, not a bug |
| **UX class if re-enabled** | **Class 3** — duplicate/conflicting UI in the input picker |
| **Action** | Remove the unreachable block when `WorkflowBuilder.tsx` is touched in **S8** (one extraction PR) |
| **Do not** | Re-enable the picker “to fix bug #1” |

### Sign-off

Recorded by excellence programme agent from commit message + live code paths. Product owner may
override if the retired UI should return — that requires a full [divergence note](./EXCELLENCE_PROGRAMME.md#the-divergence-note).

---

## 2. `xlsx` (SheetJS) — security and supply chain

### What it is

npm package `xlsx@0.18.5` — last published to the public registry years ago. SheetJS now distributes
newer builds from their own site. `npm audit --omit=dev` reports:

| Advisory | Severity | Issue |
|---|---|---|
| [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) | High | Prototype pollution |
| [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) | Moderate | ReDoS |

There is **no patched version on npm**.

### Where it is used

| File | Operation | Trust model |
|---|---|---|
| `AssetDocumentsDialog.tsx` | **Parse** user-uploaded `.xlsx` for in-app preview | Untrusted file content — **highest risk** |
| `generateBomReport.ts` | **Write** BOM export | App-generated — low risk |
| `AssetInstallationPage.tsx` | **Write** capture-table / asset export | App-generated — low risk |

Only **one parse path** (`AssetDocumentsDialog`) accepts arbitrary workbook bytes.

### Options considered

| Option | Pros | Cons |
|---|---|---|
| **A. SheetJS vendor build** (install from makers' CDN) | Stays on SheetJS API; may include fixes | Non-standard install; still tied to SheetJS |
| **B. Replace with `exceljs`** | Active npm maintenance; familiar API | Migration effort; preview HTML path must be rewritten |
| **C. Accept contained risk** | Zero user-visible change now | Advisory remains until S9 |

### Decision

| Field | Value |
|---|---|
| **Verdict** | **C — accept contained risk until S9** |
| **Rationale** | App is pre-cloud with trusted admins uploading docs; parse runs client-side only (no server RCE). Export paths are safe. Replacing the library mid-programme is Class 1–2 risk for document preview layout. |
| **Mitigations now** | (1) Upload requires authentication. (2) Preview is admin/installer context, not public. (3) Accepted file types are explicit in the upload dialog. (4) Track in [`MODERNIZATION_PLAN.md`](./MODERNIZATION_PLAN.md). |
| **S9 action** | Migrate **`AssetDocumentsDialog` parse path** to `exceljs` (or vendor SheetJS) in a dedicated PR; keep write paths on one library or migrate all three together. |
| **Blocks** | Nothing before S9; do not run `npm audit fix --force` (breaks lockfile) |

### Sign-off

Provisional — product owner may prefer **immediate migration (B)** before cloud go-live. If so, schedule
as an S4/S5 side PR with manual document-preview regression.

---

## 3. `[AllowAnonymous]` endpoint audit

The API uses a **fallback authorization policy** (`Program.cs`): every endpoint requires auth
unless marked `[AllowAnonymous]`. Twenty annotations exist across ten controllers (some
class-level, some method-level).

### Summary

| Verdict | Count | Meaning |
|---|---:|---|
| **Correct — keep** | 19 routes | Required for login, public links, tokens, SSE, or health |
| **Correct — low sensitivity** | 1 route | Office list — company metadata only |
| **Remove anonymous** | 0 | None flagged in S2 |

### Full audit

| Route | Controller | Auth mechanism | Verdict | Notes |
|---|---|---|---|---|
| `GET /api/health` | HealthController | None needed | **Keep** | Load balancers / Docker healthcheck |
| `POST /api/auth/login` | AuthController | Credentials in body | **Keep** | Entry point |
| `POST /api/auth/2fa/login` | AuthController | 2FA token | **Keep** | |
| `POST /api/auth/2fa/recovery` | AuthController | 2FA token + recovery code | **Keep** | |
| `POST /api/auth/forgot-password` | AuthController | Email | **Keep** | |
| `POST /api/auth/reset-password` | AuthController | Reset token | **Keep** | |
| `GET /api/brand-settings` | BrandSettingsController | None | **Keep** | App name/logo on login, invite, reset pages |
| `GET /api/settings/public` | SettingsController | None | **Keep** | Public frontend base URL |
| `GET /api/settings/runtime-frontend-base` | SettingsController | None | **Keep** | LAN IP discovery for native/dev |
| `GET /api/offices` | OfficesController | None | **Keep** | Country/city list only; enables native background refresh before session; not used on login screen today but harmless. Optional auth hardening in **S6** if desired |
| `GET /api/sse/events` | SseController | `?token=` JWT validated manually | **Keep** | EventSource cannot send Authorization header — documented in controller |
| `GET /api/sse/status` | SseController | Same | **Keep** | |
| `GET /api/public/sign/{tokenId}` | PublicSignController | One-time signing token | **Keep** | External customer signers |
| `POST /api/public/sign/{tokenId}/submit` | PublicSignController | Token | **Keep** | |
| `POST /api/public/sign/{tokenId}/request-otp` | PublicSignController | Token | **Keep** | |
| `GET /api/mobile-upload/token/{token}` | MobileUploadController | Upload token | **Keep** | Phone QR upload flow |
| `POST /api/mobile-upload/{token}/upload` | MobileUploadController | Upload token | **Keep** | |
| `POST /api/mobile-upload/{token}/missing-media` | MobileUploadController | Upload token | **Keep** | |
| `GET /api/mobile-upload/{token}/info` | MobileUploadController | Upload token | **Keep** | |
| `GET /api/asset-report-shares/{shareId}` | AssetReportSharesController | Share ID + expiry | **Keep** | Time-limited public report link |
| `GET /api/asset-report-shares/{shareId}/files/{fileName}` | AssetReportSharesController | Share ID + expiry | **Keep** | |
| `GET /api/asset-report-shares/{shareId}/download` | AssetReportSharesController | Share ID + expiry | **Keep** | |
| `GET /api/workflow-configs/{id}/media/{mediaId}/file` | WorkflowConfigsController | Obscure ID pair | **Keep** | Serves step media embedded in workflows/runner; config IDs are UUIDs. Revisit if media should require session |

### Optional follow-up (not S2)

- **S6:** Require auth for `GET /api/offices` if office list should not leak to unauthenticated callers
  (Class 3 if native cold-start depends on it — test on device first).
- **S6:** Scope `IssuesController.GetAll` — separate security item, not `[AllowAnonymous]` but
  over-broad for authenticated users ([`KNOWN_BUGS.md`](./KNOWN_BUGS.md) #3).

---

## Programme impact

| Stage | Unblocked by S2 |
|---|---|
| **S3** | Tests can proceed; workflow picker is not an open product question |
| **S8** | Safe to delete retired picker dead code during `WorkflowBuilder` split |
| **S9** | `xlsx` migration scoped to document-preview parse + optional export unification |

---

## References

- Bug sweep: [`CODE_QUALITY_BUG_SWEEP.md`](./CODE_QUALITY_BUG_SWEEP.md) §1, §security
- Modernization: [`MODERNIZATION_PLAN.md`](./MODERNIZATION_PLAN.md)
- Open bugs updated: [`KNOWN_BUGS.md`](./KNOWN_BUGS.md)
