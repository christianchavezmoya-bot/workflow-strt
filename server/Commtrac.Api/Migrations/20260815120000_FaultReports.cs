using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations;

/// <summary>
/// Fault reports raised from the apps. Storage types follow the SQLite-shaped convention used
/// across this chain (TEXT for dates, INTEGER for flags) — see the dual-provider section of
/// CLAUDE.md; EF bridges the CLR types on Postgres.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260815120000_FaultReports")]
public partial class FaultReports : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        var faultReports = MigrationSql.Q("FaultReports");

        migrationBuilder.Sql($@"
            CREATE TABLE IF NOT EXISTS {faultReports} (
                ""Id""               TEXT PRIMARY KEY NOT NULL,
                ""ReferenceCode""    TEXT NOT NULL DEFAULT '',
                ""Kind""             TEXT NOT NULL DEFAULT 'user-report',
                ""Severity""         TEXT NOT NULL DEFAULT 'S2',
                ""Status""           TEXT NOT NULL DEFAULT 'New',
                ""Title""            TEXT NOT NULL DEFAULT '',
                ""Description""      TEXT NULL,
                ""Platform""         TEXT NOT NULL DEFAULT 'web',
                ""AppVersion""       TEXT NULL,
                ""UserAgent""        TEXT NULL,
                ""RoutePath""        TEXT NULL,
                ""UserId""           TEXT NULL,
                ""UserEmail""        TEXT NULL,
                ""UserRole""         TEXT NULL,
                ""ErrorName""        TEXT NULL,
                ""ErrorMessage""     TEXT NULL,
                ""ErrorStack""       TEXT NULL,
                ""TraceId""          TEXT NULL,
                ""BreadcrumbsJson""  TEXT NULL,
                ""DiagnosticsJson""  TEXT NULL,
                ""WasOffline""       INTEGER NOT NULL DEFAULT 0,
                ""OccurredAtUtc""    TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                ""CreatedAtUtc""     TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                ""Notes""            TEXT NULL,
                ""ResolvedAtUtc""    TEXT NULL,
                ""ResolvedByUserId"" TEXT NULL
            )
        ");

        migrationBuilder.Sql($@"
            CREATE INDEX IF NOT EXISTS ""IX_FaultReports_CreatedAtUtc"" ON {faultReports} (""CreatedAtUtc"")
        ");
        migrationBuilder.Sql($@"
            CREATE INDEX IF NOT EXISTS ""IX_FaultReports_Status"" ON {faultReports} (""Status"")
        ");
        migrationBuilder.Sql($@"
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_FaultReports_ReferenceCode"" ON {faultReports} (""ReferenceCode"")
        ");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql($"DROP TABLE IF EXISTS {MigrationSql.Q("FaultReports")}");
    }
}
