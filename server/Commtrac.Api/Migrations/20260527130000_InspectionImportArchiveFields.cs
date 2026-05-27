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
        migrationBuilder.Sql("""
            ALTER TABLE InspectionImports ADD COLUMN IF NOT EXISTS IsArchived    INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE InspectionImports ADD COLUMN IF NOT EXISTS ArchivedAt    TEXT NULL;
            ALTER TABLE InspectionImports ADD COLUMN IF NOT EXISTS ArchivedBy    TEXT NULL;
            ALTER TABLE InspectionImports ADD COLUMN IF NOT EXISTS ArchiveReason TEXT NULL;
            ALTER TABLE InspectionImports ADD COLUMN IF NOT EXISTS ArchiveRef    TEXT NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // SQLite does not support DROP COLUMN — columns are left in place on rollback.
    }
}
