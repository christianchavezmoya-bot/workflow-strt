using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260308110000_SignatureEvents")]
    public partial class SignatureEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var runs = MigrationSql.Q("AssetWorkflowRuns");
            var sigEvents = MigrationSql.Q("SignatureEvents");
            var sigTokens = MigrationSql.Q("SignatureTokens");

            migrationBuilder.Sql($@"ALTER TABLE {runs} ADD COLUMN IF NOT EXISTS ""SignatureStatus"" TEXT NOT NULL DEFAULT 'None'");
            migrationBuilder.Sql($@"ALTER TABLE {runs} ADD COLUMN IF NOT EXISTS ""InstallerSignedAt"" TEXT NULL");
            migrationBuilder.Sql($@"ALTER TABLE {runs} ADD COLUMN IF NOT EXISTS ""CustomerSignedAt"" TEXT NULL");

            migrationBuilder.Sql($@"
                CREATE TABLE IF NOT EXISTS {sigEvents} (
                    ""Id""            TEXT PRIMARY KEY NOT NULL,
                    ""RunId""         TEXT NOT NULL DEFAULT '',
                    ""SignerRole""    TEXT NOT NULL DEFAULT '',
                    ""SignerName""    TEXT NOT NULL DEFAULT '',
                    ""SignerEmail""   TEXT NULL,
                    ""SignerTitle""   TEXT NULL,
                    ""SignedAtUtc""   TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    ""SignatureData"" TEXT NULL,
                    ""DeviceInfo""    TEXT NULL,
                    ""IpAddress""     TEXT NULL,
                    ""ReasonCode""    TEXT NOT NULL DEFAULT 'Completed',
                    ""Notes""         TEXT NULL,
                    ""TokenId""       TEXT NULL
                )
            ");

            migrationBuilder.Sql($@"
                CREATE INDEX IF NOT EXISTS ""IX_SignatureEvents_RunId"" ON {sigEvents} (""RunId"")
            ");

            migrationBuilder.Sql($@"
                CREATE TABLE IF NOT EXISTS {sigTokens} (
                    ""Id""               TEXT PRIMARY KEY NOT NULL,
                    ""RunId""            TEXT NOT NULL DEFAULT '',
                    ""ContactId""        TEXT NULL,
                    ""RecipientEmail""   TEXT NOT NULL DEFAULT '',
                    ""RecipientName""    TEXT NULL,
                    ""CreatedByUserId""  TEXT NOT NULL DEFAULT '',
                    ""CreatedAtUtc""     TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    ""ExpiresAtUtc""     TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    ""UsedAtUtc""        TEXT NULL,
                    ""IsRevoked""        INTEGER NOT NULL DEFAULT 0,
                    ""OtpHash""          TEXT NULL,
                    ""OtpExpiresAtUtc""  TEXT NULL
                )
            ");

            migrationBuilder.Sql($@"
                CREATE INDEX IF NOT EXISTS ""IX_SignatureTokens_RunId"" ON {sigTokens} (""RunId"")
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql($"DROP TABLE IF EXISTS {MigrationSql.Q("SignatureTokens")}");
            migrationBuilder.Sql($"DROP TABLE IF EXISTS {MigrationSql.Q("SignatureEvents")}");
        }
    }
}
