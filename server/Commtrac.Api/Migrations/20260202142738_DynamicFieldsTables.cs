using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class DynamicFieldsTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    FieldType = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    TablesJson = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FieldDefinitions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "FieldValues",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    FieldDefinitionId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    TableName = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    EntityId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Value = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    UpdatedAt = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FieldValues", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "FieldDefinitions",
                columns: new[] { "Id", "FieldType", "IsActive", "Name", "SortOrder", "TablesJson" },
                values: new object[,]
                {
                    { "field-active", "checkbox", true, "Active", 34, "[\"users\"]" },
                    { "field-asset-id", "primary key", true, "Asset ID#", 22, "[\"assets\"]" },
                    { "field-comments", "text", true, "Comments", 26, "[\"assets\"]" },
                    { "field-customer", "text", true, "Customer", 3, "[\"projects\",\"customers\"]" },
                    { "field-document", "file", true, "Document", 27, "[\"documents\"]" },
                    { "field-document-type", "text", true, "Document Type", 28, "[\"documents\"]" },
                    { "field-email", "email", true, "Email", 32, "[\"users\"]" },
                    { "field-finish-date", "date", true, "Finish Date", 9, "[\"issues\"]" },
                    { "field-inspector", "text", true, "Inspector", 12, "[\"inspections\"]" },
                    { "field-installer", "text", true, "Installer", 11, "[\"installations\",\"inspections\"]" },
                    { "field-issue", "text", true, "Issue", 14, "[\"issues\"]" },
                    { "field-job-number", "primary key", true, "Job Number", 1, "[\"projects\",\"installations\"]" },
                    { "field-linked-to", "text", true, "Linked To", 29, "[\"documents\"]" },
                    { "field-machine-id", "text", true, "Machine ID", 23, "[\"assets\"]" },
                    { "field-machine-type", "text", true, "Machine Type", 17, "[\"installations\",\"assets\"]" },
                    { "field-office", "text", true, "Office", 6, "[\"projects\",\"customers\",\"users\"]" },
                    { "field-owner", "text", true, "Owner", 16, "[\"issues\"]" },
                    { "field-photos", "number", true, "Photos", 13, "[\"inspections\"]" },
                    { "field-pm-count", "number", true, "PM Count", 25, "[\"assets\"]" },
                    { "field-pm1", "text", true, "PM-1 S/N", 18, "[\"installations\"]" },
                    { "field-pm2", "text", true, "PM-2 S/N", 19, "[\"installations\"]" },
                    { "field-pm3", "text", true, "PM-3 S/N", 20, "[\"installations\"]" },
                    { "field-pm4", "text", true, "PM-4 S/N", 21, "[\"installations\"]" },
                    { "field-priority", "text", true, "Priority", 15, "[\"issues\"]" },
                    { "field-products", "multi-select", true, "Products", 4, "[\"projects\",\"products\"]" },
                    { "field-progress", "percentage", true, "Progress", 10, "[\"installations\"]" },
                    { "field-project-type", "text", true, "Project Type", 2, "[\"projects\"]" },
                    { "field-role", "text", true, "Role", 33, "[\"users\"]" },
                    { "field-serial-number", "text", true, "Serial Number", 24, "[\"assets\"]" },
                    { "field-site-name", "text", true, "Site Name", 7, "[\"installations\"]" },
                    { "field-start-date", "date", true, "Start Date", 8, "[\"installations\",\"issues\"]" },
                    { "field-status", "text", true, "Status", 5, "[\"projects\",\"installations\",\"inspections\",\"issues\"]" },
                    { "field-uploaded-at", "date", true, "Uploaded At", 30, "[\"documents\"]" },
                    { "field-user-name", "text", true, "User Name", 31, "[\"users\"]" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FieldDefinitions");

            migrationBuilder.DropTable(
                name: "FieldValues");
        }
    }
}
