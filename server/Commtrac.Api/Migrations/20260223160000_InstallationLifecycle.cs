using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class InstallationLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WorkInstructionTemplates",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    ProductId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false, defaultValue: "Draft"),
                    FeatureSelectionsJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    Notes = table.Column<string>(type: "TEXT", nullable: true),
                    WorkflowTemplateId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkInstructionTemplates", x => x.Id);
                });

            migrationBuilder.AddColumn<string>(
                name: "ProjectAssetId",
                table: "WorkOrders",
                type: "TEXT",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ProjectAssets",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    ProjectId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    ProductId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    ProductConfigId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    WorkflowTemplateId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    AssetTag = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    SerialNumber = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    Location = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    AssignedUserId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: true),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false, defaultValue: "NotStarted"),
                    WorkOrderId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 800, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectAssets", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorkInstructionTemplates_ProductId",
                table: "WorkInstructionTemplates",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectAssets_ProductConfigId",
                table: "ProjectAssets",
                column: "ProductConfigId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectAssets_ProductId",
                table: "ProjectAssets",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectAssets_ProjectId",
                table: "ProjectAssets",
                column: "ProjectId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "ProjectAssets");

            migrationBuilder.DropTable(name: "WorkInstructionTemplates");

            migrationBuilder.DropColumn(
                name: "ProjectAssetId",
                table: "WorkOrders");
        }
    }
}
