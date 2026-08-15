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
        migrationBuilder.Sql(MigrationSql.AddColumn(migrationBuilder, inspectionImports, @"""IsArchived"" INTEGER NOT NULL DEFAULT 0"));
        migrationBuilder.Sql(MigrationSql.AddColumn(migrationBuilder, inspectionImports, @"""ArchivedAt"" TEXT NULL"));
        migrationBuilder.Sql(MigrationSql.AddColumn(migrationBuilder, inspectionImports, @"""ArchivedBy"" TEXT NULL"));
        migrationBuilder.Sql(MigrationSql.AddColumn(migrationBuilder, inspectionImports, @"""ArchiveReason"" TEXT NULL"));
        migrationBuilder.Sql(MigrationSql.AddColumn(migrationBuilder, inspectionImports, @"""ArchiveRef"" TEXT NULL"));
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // SQLite does not support DROP COLUMN — columns are left in place on rollback.
    }
}
