# Commtrac API (ASP.NET Core 8)

## Quick start (dev)
- From `server/Commtrac.Api`, run `dotnet run`
- API base URL: `http://localhost:4000/api`
- Swagger: `http://localhost:4000/swagger`

## Seeded admin
- Email: `admin@commtrac.local`
- Password: `Admin123!`
- Change in `appsettings.json` under `SeedAdmin`

## Auth
- JWT bearer authentication
- `POST /api/auth/login` returns `{ token, user, isFirstLogin }`
- `GET /api/auth/profile` returns the current user
- `POST /api/auth/forgot-password` (email) sends a reset link
- `POST /api/auth/reset-password` (token + new password) sets a new password

## Database
- SQLite file: `commtrac.db` (created on first run)
- Data is seeded on startup if tables are empty
- Migrations are applied automatically at startup (uses `Database.Migrate()`)

## Migrations (EF Core)
- Add a migration: `dotnet tool run dotnet-ef migrations add <Name>`
- Update DB: `dotnet tool run dotnet-ef database update`

## IIS deployment (Windows)
1) Publish the API:
   - `dotnet publish -c Release -o publish`
2) In IIS:
   - Create a new site pointing to `publish`
   - App pool: **No Managed Code**
   - Install the ASP.NET Core Hosting Bundle on the server
3) Set environment variables (IIS or `appsettings.Production.json`):
   - `ConnectionStrings__DefaultConnection`
   - `Jwt__Key`, `Jwt__Issuer`, `Jwt__Audience`
   - `SeedAdmin__Email`, `SeedAdmin__Password` (optional)
   - `Email__SmtpHost`, `Email__SmtpPort`, `Email__UseSsl`, `Email__Username`, `Email__Password`
   - `Email__FromAddress`, `Email__FrontendBaseUrl`

## SMTP examples
- Office 365:
  - `Email__SmtpHost=smtp.office365.com`
  - `Email__SmtpPort=587`
  - `Email__UseSsl=true`
- Gmail (App Password required):
  - `Email__SmtpHost=smtp.gmail.com`
  - `Email__SmtpPort=587`
  - `Email__UseSsl=true`
- SendGrid SMTP:
  - `Email__SmtpHost=smtp.sendgrid.net`
  - `Email__SmtpPort=587`
  - `Email__Username=apikey`
  - `Email__Password=<sendgrid_api_key>`

## CORS
- Allowed origin (dev): `http://localhost:5173`

## Password reset / invites
- Admin can `POST /api/users/{id}/invite` to send an invite link.
- Forgot password is `POST /api/auth/forgot-password`.
