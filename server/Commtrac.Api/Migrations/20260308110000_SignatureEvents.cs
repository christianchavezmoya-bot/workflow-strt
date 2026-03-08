using System;
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
            // Add signature columns to existing AssetWorkflowRuns
            migrationBuilder.Sql(@"ALTER TABLE AssetWorkflowRuns ADD COLUMN SignatureStatus TEXT NOT NULL DEFAULT 'None'");
            migrationBuilder.Sql(@"ALTER TABLE AssetWorkflowRuns ADD COLUMN InstallerSignedAt TEXT NULL");
            migrationBuilder.Sql(@"ALTER TABLE AssetWorkflowRuns ADD COLUMN CustomerSignedAt  TEXT NULL");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS SignatureEvents (
                    Id            TEXT PRIMARY KEY NOT NULL,
                    RunId         TEXT NOT NULL DEFAULT '',
                    SignerRole    TEXT NOT NULL DEFAULT '',
                    SignerName    TEXT NOT NULL DEFAULT '',
                    SignerEmail   TEXT NULL,
                    SignerTitle   TEXT NULL,
                    SignedAtUtc   TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    SignatureData TEXT NULL,
                    DeviceInfo    TEXT NULL,
                    IpAddress     TEXT NULL,
                    ReasonCode    TEXT NOT NULL DEFAULT 'Completed',
                    Notes         TEXT NULL,
                    TokenId       TEXT NULL
                )
            ");

            migrationBuilder.Sql(@"
                CREATE INDEX IF NOT EXISTS IX_SignatureEvents_RunId ON SignatureEvents (RunId)
            ");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS SignatureTokens (
                    Id               TEXT PRIMARY KEY NOT NULL,
                    RunId            TEXT NOT NULL DEFAULT '',
                    ContactId        TEXT NULL,
                    RecipientEmail   TEXT NOT NULL DEFAULT '',
                    RecipientName    TEXT NULL,
                    CreatedByUserId  TEXT NOT NULL DEFAULT '',
                    CreatedAtUtc     TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    ExpiresAtUtc     TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    UsedAtUtc        TEXT NULL,
                    IsRevoked        INTEGER NOT NULL DEFAULT 0,
                    OtpHash          TEXT NULL,
                    OtpExpiresAtUtc  TEXT NULL
                )
            ");

            migrationBuilder.Sql(@"
                CREATE INDEX IF NOT EXISTS IX_SignatureTokens_RunId ON SignatureTokens (RunId)
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TABLE IF EXISTS SignatureTokens");
            migrationBuilder.Sql("DROP TABLE IF EXISTS SignatureEvents");
        }
    }
}
