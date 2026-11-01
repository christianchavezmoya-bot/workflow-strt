# Staging QA account and test project

Tooling to give automated and manual acceptance testing a **dedicated, least-privilege staging
login** and an **isolated test project**, without anyone (human or agent) reading an existing
administrator password, and with a scripted cleanup. Staging only: the scripts can reach nothing
but `https://api.staging.strata-ngo.com/api`, or a local dev API with `--local`. Production is
unreachable by construction.

## What gets created

| Record | How | Who can do it |
|---|---|---|
| `ZZQA QA Project Manager` user, role **Project Manager** | `provision-users.mjs` → invite email | Admin only (API: `[Authorize(Roles="Admin")]`) |
| `ZZQA QA Installer` user, role **Installer** | same | Admin only |
| `ZZQA QA Customer <stamp>` | `seed-project.mjs` | QA PM |
| Internal project `ZZQA-<stamp>`, approved | `seed-project.mjs` | QA PM |
| One asset per workflow type with a Published config (Installation / Inspection / Commissioning / Repair / Other / custom), assigned to the QA Installer | `seed-project.mjs` | QA PM |

**Why these roles:** Project Manager is the lowest role the API lets create customers, projects
and assets and send e-sign links. It cannot manage users, roles or settings, or purge records.
The Installer runs workflows and signs as technician, like a real field user. No QA account is
an Admin.

Every record carries the `ZZQA` prefix. Created IDs are kept in `~/.strata-ngo-qa/state-staging.json`
(mode 600; IDs only, never secrets). Cleanup acts only on those IDs and refuses anything without
the prefix.

## Security

- **Passwords:** nobody chooses or sees another person's password. Users are created inactive
  with an unusable random password (server-side), and the standard invite email carries a 24 h
  link where the account owner sets their own password.
- **Admin access:** the admin step uses the admin's own short-lived **session token**
  (`ADMIN_TOKEN`), never a password, and it is never echoed, logged or stored. On the web app it is the
  `auth_token` entry in Local Storage for `https://staging.strata-ngo.com` (DevTools →
  Application → Local Storage). Copy it right before running, and close the shell afterwards.
  It is a JWT and stays valid until it expires (logging out doesn't revoke it server-side), so
  don't keep it in files or shell history.
- **QA credentials:** read from env vars or the macOS Keychain and never printed:
  ```bash
  security add-generic-password -s strata-ngo-staging-qa -a pm-email    -w '<qa pm email>'
  security add-generic-password -s strata-ngo-staging-qa -a pm-password -w   # prompts; nothing in shell history
  ```
- **2FA:** the scripts use password login only and refuse 2FA-enabled accounts. That's acceptable
  for a non-admin staging account confined to ZZQA data and deactivated after each test window.
  Enable 2FA in the UI if the account will live longer.
- **Writes:** every script is a dry run unless `--apply` is passed.

## Procedure

1. **Human (staging Admin), once:** provision and invite the two users. Use mailboxes you control,
   because the invite links go there.
   ```bash
   export ADMIN_TOKEN='<your current staging admin session token>'   # or Keychain: strata-ngo-staging-admin-token / admin
   node scripts/staging-qa/provision-users.mjs --pm-email=<qa-pm mailbox> --installer-email=<qa-installer mailbox>          # dry run
   node scripts/staging-qa/provision-users.mjs --pm-email=<qa-pm mailbox> --installer-email=<qa-installer mailbox> --apply
   unset ADMIN_TOKEN
   ```
2. **Human (mailbox owner):** open each invite link within 24 h and set a strong password.
   Store the QA PM's email and password in the Keychain (see above). Never paste them into chat.
3. **QA PM (human or agent):** seed the isolated project.
   ```bash
   node scripts/staging-qa/seed-project.mjs           # dry run: lists which workflow types have a Published config
   node scripts/staging-qa/seed-project.mjs --apply
   ```
   A type with no Published config gets no asset. To cover it, a PM publishes a config for that
   type in the app first, then re-runs the seed after cleanup.
4. **Test:** log in as the QA accounts at `https://staging.strata-ngo.com`. Work only inside the
   `ZZQA-<stamp>` project.
5. **Cleanup, after the test window:**
   ```bash
   node scripts/staging-qa/cleanup-project.mjs --apply                 # QA PM: soft-delete project + assets, delete customer
   node scripts/staging-qa/provision-users.mjs --deactivate --apply    # Admin: disable both QA users
   ```
   The project and its assets are soft-deleted, which is restorable. An Admin may hard-purge them
   in the app (Admin-only).

## Verified

The full lifecycle was run against a local dev API (`--local`, throwaway SQLite database):
provision → invite → password set through the real `/auth/reset-password` → seed (2 assets on
Published configs, assigned to the installer) → cleanup → deactivate. After deactivation, the
QA PM's login returned 401. The script has never been run against staging.
