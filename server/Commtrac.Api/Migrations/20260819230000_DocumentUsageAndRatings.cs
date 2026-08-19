using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations;

/// <summary>
/// Usage counters and per-user star ratings for library documents and tips, so an
/// admin can see which entries nobody opens and prune them.
/// Storage types follow the SQLite-shaped convention used across this chain
/// (TEXT for dates, INTEGER for counts/flags); EF bridges the CLR types on Postgres.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260819230000_DocumentUsageAndRatings")]
public partial class DocumentUsageAndRatings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        var documents = MigrationSql.Q("Documents");
        var ratings = MigrationSql.Q("DocumentRatings");

        migrationBuilder.Sql(MigrationSql.AddColumn(
            migrationBuilder, documents, @"""ViewCount"" INTEGER NOT NULL DEFAULT 0"));
        migrationBuilder.Sql(MigrationSql.AddColumn(
            migrationBuilder, documents, @"""LastViewedAtUtc"" TEXT NULL"));
        migrationBuilder.Sql(MigrationSql.AddColumn(
            migrationBuilder, documents, @"""RatingSum"" INTEGER NOT NULL DEFAULT 0"));
        migrationBuilder.Sql(MigrationSql.AddColumn(
            migrationBuilder, documents, @"""RatingCount"" INTEGER NOT NULL DEFAULT 0"));

        migrationBuilder.Sql($@"
            CREATE TABLE IF NOT EXISTS {ratings} (
                ""Id""            TEXT PRIMARY KEY NOT NULL,
                ""DocumentId""    TEXT NOT NULL DEFAULT '',
                ""UserId""        TEXT NOT NULL DEFAULT '',
                ""Stars""         INTEGER NOT NULL DEFAULT 0,
                ""CreatedAtUtc""  TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                ""UpdatedAtUtc""  TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
            )
        ");

        migrationBuilder.Sql($@"
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_DocumentRatings_DocumentId_UserId""
                ON {ratings} (""DocumentId"", ""UserId"")
        ");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql($"DROP TABLE IF EXISTS {MigrationSql.Q("DocumentRatings")}");

        // SQLite before 3.35 cannot drop columns; leaving them is harmless and keeps
        // Down() usable on both providers.
        if (MigrationSql.IsPostgres(migrationBuilder))
        {
            var documents = MigrationSql.Q("Documents");
            migrationBuilder.Sql($@"ALTER TABLE {documents} DROP COLUMN IF EXISTS ""ViewCount""");
            migrationBuilder.Sql($@"ALTER TABLE {documents} DROP COLUMN IF EXISTS ""LastViewedAtUtc""");
            migrationBuilder.Sql($@"ALTER TABLE {documents} DROP COLUMN IF EXISTS ""RatingSum""");
            migrationBuilder.Sql($@"ALTER TABLE {documents} DROP COLUMN IF EXISTS ""RatingCount""");
        }
    }
}
