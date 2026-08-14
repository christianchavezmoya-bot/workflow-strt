using System;
using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class AssetDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var assetDocuments = MigrationSql.Q("AssetDocuments");
            var assetDocumentRevisions = MigrationSql.Q("AssetDocumentRevisions");

            migrationBuilder.Sql($@"
                CREATE TABLE IF NOT EXISTS {assetDocuments} (
                    ""Id""        TEXT PRIMARY KEY NOT NULL,
                    ""AssetId""   TEXT NOT NULL DEFAULT '',
                    ""Label""     TEXT NOT NULL DEFAULT 'Document',
                    ""CreatedBy"" TEXT NULL,
                    ""CreatedAt"" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
                )
            ");

            migrationBuilder.Sql($@"
                CREATE INDEX IF NOT EXISTS ""IX_AssetDocuments_AssetId""
                ON {assetDocuments} (""AssetId"")
            ");

            migrationBuilder.Sql($@"
                CREATE TABLE IF NOT EXISTS {assetDocumentRevisions} (
                    ""Id""             TEXT PRIMARY KEY NOT NULL,
                    ""DocumentId""     TEXT NOT NULL DEFAULT '',
                    ""RevisionNumber"" INTEGER NOT NULL DEFAULT 1,
                    ""OriginalName""   TEXT NOT NULL DEFAULT '',
                    ""StoredName""     TEXT NOT NULL DEFAULT '',
                    ""MimeType""       TEXT NOT NULL DEFAULT '',
                    ""FileSizeBytes""  INTEGER NOT NULL DEFAULT 0,
                    ""UploadedBy""     TEXT NULL,
                    ""UploadedAt""     TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
                )
            ");

            migrationBuilder.Sql($@"
                CREATE INDEX IF NOT EXISTS ""IX_AssetDocumentRevisions_DocumentId""
                ON {assetDocumentRevisions} (""DocumentId"")
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql($"DROP TABLE IF EXISTS {MigrationSql.Q("AssetDocumentRevisions")}");
            migrationBuilder.Sql($"DROP TABLE IF EXISTS {MigrationSql.Q("AssetDocuments")}");
        }
    }
}
