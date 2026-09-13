using Npgsql;

namespace Commtrac.Api.Hosting;

/// <summary>
/// Resolves the PostgreSQL connection string either from split Database:* configuration
/// (the target architecture — host/port/db/username are plain config, password comes from
/// an ECS-injected secret pointing directly at the RDS-managed rotating secret, eliminating
/// the duplicated-password drift that caused the 2026-09-13 production outage) or, when
/// Database:Host is absent, from the legacy single ConnectionStrings:DefaultConnection value
/// (today's actual staging/production configuration, and every local Postgres-parity setup —
/// see appsettings.PostgresLocal.json / appsettings.StagingDocker.json / appsettings.Staging.json
/// / appsettings.Production.json). This keeps this change deployable to both environments
/// completely unchanged before any AWS/task-definition migration happens.
///
/// Once Database:Host is configured, split configuration becomes authoritative and MUST be
/// complete — a partially migrated environment (e.g. Host set but Password still missing)
/// fails fast in non-Development rather than silently falling back to the legacy connection
/// string, which could resurrect the exact stale/duplicated password this resolver exists to
/// eliminate.
///
/// Builds via NpgsqlConnectionStringBuilder — never manual string concatenation — so a
/// password containing ';', '=', or other connection-string-special characters is escaped
/// correctly. Deliberately sets nothing beyond Host/Port/Database/Username/Password: none of
/// this codebase's existing ConnectionStrings:DefaultConnection values specify SSL mode,
/// pooling, or any other option, so Npgsql's own defaults are what is actually running today.
/// This resolver reproduces that exactly rather than introducing new connection semantics.
/// </summary>
public static class DatabaseConnectionStringResolver
{
    public const int DefaultPort = 5432;

    public static string Resolve(IConfiguration configuration, IHostEnvironment environment)
    {
        var host = configuration["Database:Host"];

        if (string.IsNullOrWhiteSpace(host))
        {
            var legacy = configuration.GetConnectionString("DefaultConnection");
            if (string.IsNullOrWhiteSpace(legacy))
            {
                throw new InvalidOperationException(
                    "Neither Database:Host nor ConnectionStrings:DefaultConnection is configured.");
            }
            return legacy;
        }

        // Database:Host is set — split configuration is authoritative from here on. Never
        // fall back to the legacy connection string for a partially configured environment.
        var database = RequireValue(configuration, "Database:Name", environment);
        var username = RequireValue(configuration, "Database:Username", environment);
        var password = RequireValue(configuration, "Database:Password", environment);

        var port = DefaultPort;
        var portValue = configuration["Database:Port"];
        if (!string.IsNullOrWhiteSpace(portValue) && !int.TryParse(portValue, out port))
        {
            throw new InvalidOperationException("Database:Port is set but is not a valid integer.");
        }

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = host,
            Port = port,
            Database = database,
            Username = username,
            Password = password,
        };

        return builder.ConnectionString;
    }

    private static string RequireValue(IConfiguration configuration, string key, IHostEnvironment environment)
    {
        var value = configuration[key];
        if (!string.IsNullOrWhiteSpace(value)) return value;

        if (environment.IsDevelopment())
        {
            // Split configuration isn't exercised by any checked-in Development setup today
            // (Sqlite is the default there), but an opted-in local split-config Postgres
            // setup shouldn't be hard-blocked either — same leniency JwtKeyResolver gives
            // Development. Npgsql/Postgres itself will reject an empty username/database at
            // connect time, which is an honest failure for a deliberately incomplete local setup.
            return string.Empty;
        }

        throw new InvalidOperationException(
            $"Database:Host is configured but {key} is missing. " +
            "Split database configuration is incomplete for a non-Development environment.");
    }
}
