# Outbound email (Resend)

Production email is sent through [Resend](https://resend.com) from:

`Strata-ngo <noreply@strata-ngo.com>`

## API key (never commit)

Store the Resend API key **only** in environment variables or .NET user secrets — never in `appsettings.json`, the React app, or git.

### Windows — user secrets (recommended for local dev)

The project includes a committed `UserSecretsId` in `Commtrac.Api.csproj`. Secrets load automatically when `ASPNETCORE_ENVIRONMENT=Development` (default for `dotnet run`).

From the repo root:

```powershell
dotnet user-secrets set "Email:ResendApiKey" "re_YOUR_KEY_HERE" --project server/Commtrac.Api
```

No `dotnet user-secrets init` step is required.

### Resend sender address

Resend always sends from **`Strata-ngo <noreply@strata-ngo.com>`** (see `AppBranding`). This is independent of the SMTP "from" field in notification settings, so a legacy `commtrac.local` value in the DB cannot cause Resend 403 errors.

### Environment variable (production / CI)

Either name works:

- `Email__ResendApiKey`
- `Resend__ApiKey`

## Verify delivery

1. Start the API: `dotnet run --project server/Commtrac.Api`
2. Sign in as Admin.
3. Send a test message:

```http
POST /api/settings/notifications/test-email
Authorization: Bearer <token>
Content-Type: application/json

{ "toEmail": "you@example.com" }
```

The response reports the transport used: `resend`, `smtp`, or `simulated`.

## Fallback behaviour

1. **Resend** when an API key is configured (retries transient failures up to 3 times).
2. **SMTP** when no Resend key but SMTP host is configured in notification settings.
3. **Simulated** (log-only) when neither is configured — core app flows still succeed.

Email failures are logged and never thrown to callers.

## Supported message types

- Test email (admin endpoint)
- User invitations
- Password resets and account lockout notices
- Customer workflow / signature links
- Workflow completion notifications (Admin / Project Manager)

## Production deliverability (not PR blockers)

Verified on Windows (2026-07-26): all six test sends were **delivered** via Resend from `Strata-ngo <noreply@strata-ngo.com>`. One password-reset message landed in **Spam** because invite/reset links used a **private LAN IP over HTTP** (`http://10.x.x.x:5173/...`). That is expected in local dev and is a strong spam signal for real recipients.

Before go-live:

1. Set **`Email:FrontendBaseUrl`** (notification settings or env) to your public HTTPS app URL, e.g. `https://app.strata-ngo.com` — never a bare LAN IP in production emails.
2. Confirm **SPF, DKIM, and DMARC** for `strata-ngo.com` in Cloudflare + Resend (you already have DKIM/SPF/MX for Resend; add DMARC if missing).
3. After DNS propagates, send a fresh invite/reset to an external inbox and confirm **Inbox** (not Spam).

Local dev can keep a LAN IP in `appsettings.Development.json` for on-network testing; production/staging must use the verified domain.
