using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260319130000_BomModule")]
    public partial class BomModule : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BomImportRuns",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    FileName = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    FileSizeBytes = table.Column<long>(type: "INTEGER", nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UploadedBy = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false, defaultValue: "uploading"),
                    StatusMessage = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    SheetNamesJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    SelectedSheetsJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    MappingProfileId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    RuleProfileId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    TotalRawRows = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                    NormalizedRows = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                    ClassifiedRows = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                    ValidationErrors = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                    ValidationWarnings = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                    PublishedProjectId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    RawRowsJson = table.Column<string>(type: "TEXT", nullable: true),
                    NormalizedRowsJson = table.Column<string>(type: "TEXT", nullable: true),
                    ClassificationsJson = table.Column<string>(type: "TEXT", nullable: true),
                    MappingsJson = table.Column<string>(type: "TEXT", nullable: true),
                    DraftProjectJson = table.Column<string>(type: "TEXT", nullable: true),
                    ValidationResultJson = table.Column<string>(type: "TEXT", nullable: true),
                    CommitLogsJson = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BomImportRuns", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BomImportRuns_Status",
                table: "BomImportRuns",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_BomImportRuns_UploadedAt",
                table: "BomImportRuns",
                column: "UploadedAt");

            migrationBuilder.CreateTable(
                name: "BomMappingProfiles",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    MappingsJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BomMappingProfiles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BomRuleProfiles",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    RulesJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BomRuleProfiles", x => x.Id);
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Dropping all BOM module tables safely removes the module completely
            migrationBuilder.DropTable(name: "BomImportRuns");
            migrationBuilder.DropTable(name: "BomMappingProfiles");
            migrationBuilder.DropTable(name: "BomRuleProfiles");
        }
    }
}
