using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations;

public partial class WorkflowModeAndInspectionImports : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // ── WorkflowMode on Projects ─────────────────────────────────────────
        migrationBuilder.AddColumn<string>(
            name: "WorkflowMode",
            table: "Projects",
            type: "TEXT",
            maxLength: 40,
            nullable: true);

        // ── InspectionImports table ───────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "InspectionImports",
            columns: table => new
            {
                Id          = table.Column<string>(type: "TEXT", nullable: false),
                Source      = table.Column<string>(type: "TEXT", maxLength: 40,   nullable: false, defaultValue: "LOCAL"),
                ReceivedAt  = table.Column<DateTime>(type: "TEXT", nullable: false),
                FileName    = table.Column<string>(type: "TEXT", maxLength: 500,  nullable: true),
                ContentHash = table.Column<string>(type: "TEXT", maxLength: 64,   nullable: true),
                RawJson     = table.Column<string>(type: "TEXT", nullable: true),
                RawPath     = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                ProjectId   = table.Column<string>(type: "TEXT", maxLength: 100,  nullable: true),
                AssetId     = table.Column<string>(type: "TEXT", maxLength: 100,  nullable: true),
                Status      = table.Column<string>(type: "TEXT", maxLength: 40,   nullable: false, defaultValue: "RECEIVED"),
                ErrorText   = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                MappedRunId = table.Column<string>(type: "TEXT", maxLength: 100,  nullable: true),
                UploadedBy  = table.Column<string>(type: "TEXT", maxLength: 200,  nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_InspectionImports", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_InspectionImports_ProjectId",
            table: "InspectionImports",
            column: "ProjectId");

        migrationBuilder.CreateIndex(
            name: "IX_InspectionImports_AssetId",
            table: "InspectionImports",
            column: "AssetId");

        migrationBuilder.CreateIndex(
            name: "IX_InspectionImports_ContentHash",
            table: "InspectionImports",
            column: "ContentHash");

        migrationBuilder.CreateIndex(
            name: "IX_InspectionImports_Status",
            table: "InspectionImports",
            column: "Status");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "InspectionImports");
        migrationBuilder.DropColumn(name: "WorkflowMode", table: "Projects");
    }
}
