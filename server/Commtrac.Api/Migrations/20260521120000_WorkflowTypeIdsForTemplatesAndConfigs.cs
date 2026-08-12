using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260521120000_WorkflowTypeIdsForTemplatesAndConfigs")]
public partial class WorkflowTypeIdsForTemplatesAndConfigs : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "WorkflowTypeId",
            table: "WorkflowTemplates",
            type: "TEXT",
            maxLength: 100,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "WorkflowTypeId",
            table: "WorkflowConfigs",
            type: "TEXT",
            maxLength: 100,
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_WorkflowTemplates_WorkflowTypeId",
            table: "WorkflowTemplates",
            column: "WorkflowTypeId");

        migrationBuilder.CreateIndex(
            name: "IX_WorkflowConfigs_WorkflowTypeId",
            table: "WorkflowConfigs",
            column: "WorkflowTypeId");

        migrationBuilder.Sql("""
            INSERT INTO WorkflowTypes (Id, Name, Icon, SortOrder, IsActive)
            VALUES ('wftype-other', 'Other', NULL, 5, 1)
            ON CONFLICT (Id) DO NOTHING;
            """);

        migrationBuilder.Sql("""
            UPDATE WorkflowConfigs
            SET WorkflowTypeId = CASE LOWER(TRIM(COALESCE(ConfigType, '')))
                WHEN 'installation' THEN 'wftype-installation'
                WHEN 'commissioning' THEN 'wftype-commissioning'
                WHEN 'inspection' THEN 'wftype-inspection'
                WHEN 'repair' THEN 'wftype-repair'
                WHEN 'other' THEN 'wftype-other'
                ELSE 'wftype-installation'
            END
            WHERE WorkflowTypeId IS NULL;
            """);

        migrationBuilder.Sql("""
            UPDATE WorkflowTemplates
            SET WorkflowTypeId = CASE
                WHEN LOWER(COALESCE(Name, '')) LIKE '%inspection%' THEN 'wftype-inspection'
                WHEN LOWER(COALESCE(Name, '')) LIKE '%commission%' THEN 'wftype-commissioning'
                WHEN LOWER(COALESCE(Name, '')) LIKE '%repair%' THEN 'wftype-repair'
                WHEN LOWER(COALESCE(Name, '')) LIKE '%other%' THEN 'wftype-other'
                ELSE 'wftype-installation'
            END
            WHERE WorkflowTypeId IS NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_WorkflowTemplates_WorkflowTypeId",
            table: "WorkflowTemplates");

        migrationBuilder.DropIndex(
            name: "IX_WorkflowConfigs_WorkflowTypeId",
            table: "WorkflowConfigs");

        migrationBuilder.DropColumn(
            name: "WorkflowTypeId",
            table: "WorkflowTemplates");

        migrationBuilder.DropColumn(
            name: "WorkflowTypeId",
            table: "WorkflowConfigs");

        migrationBuilder.Sql("""
            DELETE FROM WorkflowTypes
            WHERE Id = 'wftype-other';
            """);
    }
}
