using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class WorkflowConfigFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WorkflowConfigFeatures",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    WorkflowConfigId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    FeatureId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Quantity = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 1),
                    InclusionsJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "{}"),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowConfigFeatures", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowConfigFeatures_WorkflowConfigId",
                table: "WorkflowConfigFeatures",
                column: "WorkflowConfigId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowConfigFeatures_FeatureId",
                table: "WorkflowConfigFeatures",
                column: "FeatureId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "WorkflowConfigFeatures");
        }
    }
}
