using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class ProjectWorkflowModeAndInspectionImports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "WorkflowMode",
                table: "Projects",
                type: "TEXT",
                maxLength: 40,
                nullable: false,
                defaultValue: "INSTALLATION_ONLY");

            migrationBuilder.Sql(
                """
                UPDATE Projects
                SET WorkflowMode = CASE
                    WHEN IsInstallationProject = 1 THEN 'INSTALLATION_ONLY'
                    ELSE 'INSPECTION_ONLY'
                END;
                """
            );

            migrationBuilder.CreateTable(
                name: "InspectionImports",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Source = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    RawJson = table.Column<string>(type: "TEXT", nullable: false),
                    Hash = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    ProjectId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: true),
                    ProjectAssetId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    Status = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Error = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    MappedRunId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InspectionImports", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InspectionImports_Hash",
                table: "InspectionImports",
                column: "Hash");

            migrationBuilder.CreateIndex(
                name: "IX_InspectionImports_ProjectAssetId",
                table: "InspectionImports",
                column: "ProjectAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_InspectionImports_ProjectId",
                table: "InspectionImports",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_InspectionImports_Status",
                table: "InspectionImports",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InspectionImports");

            migrationBuilder.DropColumn(
                name: "WorkflowMode",
                table: "Projects");
        }
    }
}
