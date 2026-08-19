using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260819100000_ProjectWorkflowTypeId")]
public partial class ProjectWorkflowTypeId : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "WorkflowTypeId",
            table: "Projects",
            type: "TEXT",
            maxLength: 100,
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_Projects_WorkflowTypeId",
            table: "Projects",
            column: "WorkflowTypeId");

        var projects = MigrationSql.Q("Projects");

        // Backfill from legacy WorkflowMode / IsInstallationProject. MIXED stays null until PM picks one type.
        migrationBuilder.Sql($"""
            UPDATE {projects}
            SET "WorkflowTypeId" = CASE COALESCE("WorkflowMode", CASE WHEN "IsInstallationProject" = 1 THEN 'INSTALLATION_ONLY' ELSE 'INSPECTION_ONLY' END)
                WHEN 'INSPECTION_ONLY' THEN 'wftype-inspection'
                WHEN 'MIXED' THEN NULL
                ELSE 'wftype-installation'
            END
            WHERE "WorkflowTypeId" IS NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_Projects_WorkflowTypeId",
            table: "Projects");

        migrationBuilder.DropColumn(
            name: "WorkflowTypeId",
            table: "Projects");
    }
}
