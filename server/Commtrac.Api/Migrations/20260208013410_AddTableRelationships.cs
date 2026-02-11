using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTableRelationships : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Issues_InstallationId",
                table: "Issues",
                column: "InstallationId");

            migrationBuilder.CreateIndex(
                name: "IX_Installations_ProjectId",
                table: "Installations",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_Inspections_InstallationId",
                table: "Inspections",
                column: "InstallationId");

            migrationBuilder.CreateIndex(
                name: "IX_InspectionPhotos_InspectionId",
                table: "InspectionPhotos",
                column: "InspectionId");

            migrationBuilder.CreateIndex(
                name: "IX_FieldValues_FieldDefinitionId",
                table: "FieldValues",
                column: "FieldDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_FieldValues_TableName_EntityId",
                table: "FieldValues",
                columns: new[] { "TableName", "EntityId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Issues_InstallationId",
                table: "Issues");

            migrationBuilder.DropIndex(
                name: "IX_Installations_ProjectId",
                table: "Installations");

            migrationBuilder.DropIndex(
                name: "IX_Inspections_InstallationId",
                table: "Inspections");

            migrationBuilder.DropIndex(
                name: "IX_InspectionPhotos_InspectionId",
                table: "InspectionPhotos");

            migrationBuilder.DropIndex(
                name: "IX_FieldValues_FieldDefinitionId",
                table: "FieldValues");

            migrationBuilder.DropIndex(
                name: "IX_FieldValues_TableName_EntityId",
                table: "FieldValues");
        }
    }
}
