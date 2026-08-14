using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260527130000_InspectionImportArchiveFields")]
public partial class InspectionImportArchiveFields : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        var inspectionImports = MigrationSql.Q("InspectionImports");
        migrationBuilder.Sql($@"ALTER TABLE {inspectionImports} ADD COLUMN IF NOT EXISTS ""IsArchived""    INTEGER NOT NULL DEFAULT 0;");
        migrationBuilder.Sql($@"ALTER TABLE {inspectionImports} ADD COLUMN IF NOT EXISTS ""ArchivedAt""    TEXT NULL;");
        migrationBuilder.Sql($@"ALTER TABLE {inspectionImports} ADD COLUMN IF NOT EXISTS ""ArchivedBy""    TEXT NULL;");
        migrationBuilder.Sql($@"ALTER TABLE {inspectionImports} ADD COLUMN IF NOT EXISTS ""ArchiveReason"" TEXT NULL;");
        migrationBuilder.Sql($@"ALTER TABLE {inspectionImports} ADD COLUMN IF NOT EXISTS ""ArchiveRef""    TEXT NULL;");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // SQLite does not support DROP COLUMN — columns are left in place on rollback.
    }
}
