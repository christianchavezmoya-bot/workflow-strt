using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260227120000_WorkflowConfigUnification")]
    public partial class WorkflowConfigUnification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── 1. Add AssetName, AssetModel, Manufacturer, IssuesJson to ProjectAssets ──
            migrationBuilder.AddColumn<string>(
                name: "AssetName",
                table: "ProjectAssets",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AssetModel",
                table: "ProjectAssets",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Manufacturer",
                table: "ProjectAssets",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IssuesJson",
                table: "ProjectAssets",
                type: "TEXT",
                nullable: false,
                defaultValue: "[]");

            // ── 2. Create WorkflowTypes table ──────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "WorkflowTypes",
                columns: table => new
                {
                    Id        = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Name      = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Icon      = table.Column<string>(type: "TEXT", maxLength: 50, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                    IsActive  = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: true)
                },
                constraints: table => table.PrimaryKey("PK_WorkflowTypes", x => x.Id));

            // ── 3. Create WorkflowConfigs table ────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "WorkflowConfigs",
                columns: table => new
                {
                    Id                   = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    ProductId            = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Name                 = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    DisplayName          = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    ConfigType           = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    Status               = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false, defaultValue: "Draft"),
                    Version              = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 1),
                    TemplateSourceId     = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    StepsJson            = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    MediaJson            = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    FeatureSelectionsJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    Notes                = table.Column<string>(type: "TEXT", nullable: true),
                    CreatedBy            = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    CreatedAt            = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt            = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_WorkflowConfigs", x => x.Id));

            migrationBuilder.CreateIndex(name: "IX_WorkflowConfigs_ProductId", table: "WorkflowConfigs", column: "ProductId");
            migrationBuilder.CreateIndex(name: "IX_WorkflowConfigs_Status",    table: "WorkflowConfigs", column: "Status");

            // ── 4. Create AssetWorkflowAssignments table ───────────────────────────────
            migrationBuilder.CreateTable(
                name: "AssetWorkflowAssignments",
                columns: table => new
                {
                    Id               = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    AssetId          = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    WorkflowConfigId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    WorkflowTypeId   = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Active           = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: true),
                    AssignedBy       = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    AssignedAt       = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_AssetWorkflowAssignments", x => x.Id));

            migrationBuilder.CreateIndex(name: "IX_AssetWorkflowAssignments_AssetId",          table: "AssetWorkflowAssignments", column: "AssetId");
            migrationBuilder.CreateIndex(name: "IX_AssetWorkflowAssignments_WorkflowConfigId", table: "AssetWorkflowAssignments", column: "WorkflowConfigId");

            // ── 5. Create AssetWorkflowRuns table ─────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "AssetWorkflowRuns",
                columns: table => new
                {
                    Id                   = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    AssetId              = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    WorkflowConfigId     = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    WorkflowVersion      = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 1),
                    WorkflowSnapshotJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "{}"),
                    WorkOrderId          = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    Status               = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false, defaultValue: "InProgress"),
                    IsLocked             = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: false),
                    TechnicianUserId     = table.Column<string>(type: "TEXT", maxLength: 80, nullable: true),
                    StepResultsJson      = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    IssuesJson           = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    StartedAt            = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CompletedAt          = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedAt            = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt            = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_AssetWorkflowRuns", x => x.Id));

            migrationBuilder.CreateIndex(name: "IX_AssetWorkflowRuns_AssetId",          table: "AssetWorkflowRuns", column: "AssetId");
            migrationBuilder.CreateIndex(name: "IX_AssetWorkflowRuns_WorkflowConfigId", table: "AssetWorkflowRuns", column: "WorkflowConfigId");

            var workflowTypes = MigrationSql.Q("WorkflowTypes");
            var workflowConfigs = MigrationSql.Q("WorkflowConfigs");
            var workInstructionTemplates = MigrationSql.Q("WorkInstructionTemplates");
            var workflowTemplates = MigrationSql.Q("WorkflowTemplates");
            var assetWorkflowAssignments = MigrationSql.Q("AssetWorkflowAssignments");
            var projectAssets = MigrationSql.Q("ProjectAssets");
            var assetWorkflowRuns = MigrationSql.Q("AssetWorkflowRuns");
            var workOrders = MigrationSql.Q("WorkOrders");

            // ── 6. Seed default WorkflowTypes ──────────────────────────────────────────
            migrationBuilder.Sql($@"
                INSERT INTO {workflowTypes} (""Id"", ""Name"", ""Icon"", ""SortOrder"", ""IsActive"") VALUES
                ('wftype-installation',  'Installation',  NULL, 1, 1),
                ('wftype-commissioning', 'Commissioning', NULL, 2, 1),
                ('wftype-inspection',    'Inspection',    NULL, 3, 1),
                ('wftype-repair',        'Repair',        NULL, 4, 1)
                ON CONFLICT (""Id"") DO NOTHING
            ");

            // ── 7. Migrate WorkInstructionTemplates → WorkflowConfigs ─────────────────
            // LEFT JOIN with WorkflowTemplates to pull in steps/media where linked.
            // Status mapping: Active → Published, Draft → Draft, Archived → Archived.
            migrationBuilder.Sql($@"
                INSERT INTO {workflowConfigs} (
                    ""Id"", ""ProductId"", ""Name"", ""DisplayName"", ""ConfigType"",
                    ""Status"", ""Version"", ""TemplateSourceId"",
                    ""StepsJson"", ""MediaJson"", ""FeatureSelectionsJson"",
                    ""Notes"", ""CreatedBy"", ""CreatedAt"", ""UpdatedAt""
                )
                SELECT
                    wit.""Id"",
                    wit.""ProductId"",
                    wit.""Name"",
                    wit.""Name"" AS ""DisplayName"",
                    wit.""ConfigType"",
                    CASE wit.""Status""
                        WHEN 'Active' THEN 'Published'
                        ELSE wit.""Status""
                    END AS ""Status"",
                    1 AS ""Version"",
                    NULL AS ""TemplateSourceId"",
                    COALESCE(wt.""StepsJson"", '[]') AS ""StepsJson"",
                    COALESCE(wt.""MediaJson"", '[]') AS ""MediaJson"",
                    COALESCE(wit.""FeatureSelectionsJson"", '[]') AS ""FeatureSelectionsJson"",
                    wit.""Notes"",
                    wit.""CreatedBy"",
                    wit.""CreatedAt"",
                    wit.""UpdatedAt""
                FROM {workInstructionTemplates} wit
                LEFT JOIN {workflowTemplates} wt ON wt.""Id"" = wit.""WorkflowTemplateId""
            ");

            // ── 8. Create AssetWorkflowAssignments from ProjectAssets ─────────────────
            var assignmentIdExpr = MigrationSql.IsPostgres(migrationBuilder)
                ? "gen_random_uuid()::text"
                : @"lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
                        substr(lower(hex(randomblob(2))),2) || '-' ||
                        substr('89ab',abs(random()) % 4 + 1, 1) ||
                        substr(lower(hex(randomblob(2))),2) || '-' ||
                        lower(hex(randomblob(6)))";

            migrationBuilder.Sql($@"
                INSERT INTO {assetWorkflowAssignments} (
                    ""Id"", ""AssetId"", ""WorkflowConfigId"", ""WorkflowTypeId"", ""Active"", ""AssignedBy"", ""AssignedAt""
                )
                SELECT
                    {assignmentIdExpr} AS ""Id"",
                    pa.""Id"" AS ""AssetId"",
                    pa.""ProductConfigId"" AS ""WorkflowConfigId"",
                    'wftype-installation' AS ""WorkflowTypeId"",
                    1 AS ""Active"",
                    NULL AS ""AssignedBy"",
                    pa.""CreatedAt"" AS ""AssignedAt""
                FROM {projectAssets} pa
                WHERE pa.""ProductConfigId"" IS NOT NULL
                  AND EXISTS (SELECT 1 FROM {workflowConfigs} wc WHERE wc.""Id"" = pa.""ProductConfigId"")
            ");

            // ── 9. Create AssetWorkflowRuns from WorkOrders ───────────────────────────
            // Historical runs don't have a snapshot (WorkflowSnapshotJson = '{}').
            migrationBuilder.Sql($@"
                INSERT INTO {assetWorkflowRuns} (
                    ""Id"", ""AssetId"", ""WorkflowConfigId"", ""WorkflowVersion"",
                    ""WorkflowSnapshotJson"", ""WorkOrderId"", ""Status"", ""IsLocked"",
                    ""TechnicianUserId"", ""StepResultsJson"", ""IssuesJson"",
                    ""StartedAt"", ""CompletedAt"", ""CreatedAt"", ""UpdatedAt""
                )
                SELECT
                    wo.""Id"" AS ""Id"",
                    wo.""ProjectAssetId"" AS ""AssetId"",
                    COALESCE(pa.""ProductConfigId"", '') AS ""WorkflowConfigId"",
                    1 AS ""WorkflowVersion"",
                    '{{}}' AS ""WorkflowSnapshotJson"",
                    wo.""Id"" AS ""WorkOrderId"",
                    wo.""Status"",
                    CASE WHEN wo.""Status"" = 'Complete' THEN 1 ELSE 0 END AS ""IsLocked"",
                    NULL AS ""TechnicianUserId"",
                    COALESCE(wo.""StepsDataJson"", '[]') AS ""StepResultsJson"",
                    COALESCE(pa.""IssuesJson"", '[]') AS ""IssuesJson"",
                    wo.""CreatedAt"" AS ""StartedAt"",
                    CASE WHEN wo.""Status"" = 'Complete' THEN wo.""UpdatedAt"" ELSE NULL END AS ""CompletedAt"",
                    wo.""CreatedAt"",
                    wo.""UpdatedAt""
                FROM {workOrders} wo
                LEFT JOIN {projectAssets} pa ON pa.""Id"" = wo.""ProjectAssetId""
                WHERE wo.""ProjectAssetId"" IS NOT NULL
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "AssetWorkflowRuns");
            migrationBuilder.DropTable(name: "AssetWorkflowAssignments");
            migrationBuilder.DropTable(name: "WorkflowConfigs");
            migrationBuilder.DropTable(name: "WorkflowTypes");
            migrationBuilder.DropColumn(name: "AssetName",     table: "ProjectAssets");
            migrationBuilder.DropColumn(name: "AssetModel",    table: "ProjectAssets");
            migrationBuilder.DropColumn(name: "Manufacturer",  table: "ProjectAssets");
            migrationBuilder.DropColumn(name: "IssuesJson",    table: "ProjectAssets");
        }
    }
}
