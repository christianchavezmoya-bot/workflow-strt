using System;
using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class AssetDocumentLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var assetDocumentLinks = MigrationSql.Q("AssetDocumentLinks");

            migrationBuilder.Sql($@"
                CREATE TABLE IF NOT EXISTS {assetDocumentLinks} (
                    ""Id""         TEXT PRIMARY KEY NOT NULL,
                    ""AssetId""    TEXT NOT NULL DEFAULT '',
                    ""DocumentId"" TEXT NOT NULL DEFAULT '',
                    ""AttachedBy"" TEXT NULL,
                    ""AttachedAt"" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
                )
            ");

            migrationBuilder.Sql($@"
                CREATE INDEX IF NOT EXISTS ""IX_AssetDocumentLinks_AssetId""
                ON {assetDocumentLinks} (""AssetId"")
            ");

            migrationBuilder.Sql($@"
                CREATE INDEX IF NOT EXISTS ""IX_AssetDocumentLinks_DocumentId""
                ON {assetDocumentLinks} (""DocumentId"")
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql($"DROP TABLE IF EXISTS {MigrationSql.Q("AssetDocumentLinks")}");
        }
    }
}
