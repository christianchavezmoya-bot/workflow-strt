using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations;

/// <summary>
/// Lifecycle events for a fault report. Storage types follow the SQLite-shaped convention used
/// across this chain (TEXT for dates, INTEGER for flags) — see the dual-provider section of
/// CLAUDE.md; EF bridges the CLR types on Postgres.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260817010000_FaultReportUpdates")]
public partial class FaultReportUpdates : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        var updates = MigrationSql.Q("FaultReportUpdates");

        migrationBuilder.Sql($@"
            CREATE TABLE IF NOT EXISTS {updates} (
                ""Id""              TEXT PRIMARY KEY NOT NULL,
                ""FaultReportId""   TEXT NOT NULL DEFAULT '',
                ""Action""          TEXT NOT NULL DEFAULT '',
                ""Status""          TEXT NOT NULL DEFAULT 'Investigating',
                ""AuthorUserId""    TEXT NULL,
                ""AuthorName""      TEXT NULL,
                ""SystemGenerated"" INTEGER NOT NULL DEFAULT 0,
                ""CreatedAtUtc""    TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
            )
        ");

        migrationBuilder.Sql($@"
            CREATE INDEX IF NOT EXISTS ""IX_FaultReportUpdates_FaultReportId""
            ON {updates} (""FaultReportId"")
        ");
        migrationBuilder.Sql($@"
            CREATE INDEX IF NOT EXISTS ""IX_FaultReportUpdates_CreatedAtUtc""
            ON {updates} (""CreatedAtUtc"")
        ");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql($"DROP TABLE IF EXISTS {MigrationSql.Q("FaultReportUpdates")}");
    }
}
