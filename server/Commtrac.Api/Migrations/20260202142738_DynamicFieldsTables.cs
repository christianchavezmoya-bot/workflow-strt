using Commtrac.Api.Data;
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
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
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

            // "IsActive" is an INTEGER column on both providers, but InsertData types the parameter
            // differently per provider: Npgsql infers it from the CLR value (a bool would be sent as
            // boolean and rejected), while the SQLite generator coerces to the column's bool type.
            object active = MigrationSql.IsPostgres(migrationBuilder) ? 1 : true;

            migrationBuilder.InsertData(
                table: "FieldDefinitions",
                columns: new[] { "Id", "FieldType", "IsActive", "Name", "SortOrder", "TablesJson" },
                values: new object[,]
                {
                    { "field-active", "checkbox", active, "Active", 34, "[\"users\"]" },
                    { "field-asset-id", "primary key", active, "Asset ID#", 22, "[\"assets\"]" },
                    { "field-comments", "text", active, "Comments", 26, "[\"assets\"]" },
                    { "field-customer", "text", active, "Customer", 3, "[\"projects\",\"customers\"]" },
                    { "field-document", "file", active, "Document", 27, "[\"documents\"]" },
                    { "field-document-type", "text", active, "Document Type", 28, "[\"documents\"]" },
                    { "field-email", "email", active, "Email", 32, "[\"users\"]" },
                    { "field-finish-date", "date", active, "Finish Date", 9, "[\"issues\"]" },
                    { "field-inspector", "text", active, "Inspector", 12, "[\"inspections\"]" },
                    { "field-installer", "text", active, "Installer", 11, "[\"installations\",\"inspections\"]" },
                    { "field-issue", "text", active, "Issue", 14, "[\"issues\"]" },
                    { "field-job-number", "primary key", active, "Job Number", 1, "[\"projects\",\"installations\"]" },
                    { "field-linked-to", "text", active, "Linked To", 29, "[\"documents\"]" },
                    { "field-machine-id", "text", active, "Machine ID", 23, "[\"assets\"]" },
                    { "field-machine-type", "text", active, "Machine Type", 17, "[\"installations\",\"assets\"]" },
                    { "field-office", "text", active, "Office", 6, "[\"projects\",\"customers\",\"users\"]" },
                    { "field-owner", "text", active, "Owner", 16, "[\"issues\"]" },
                    { "field-photos", "number", active, "Photos", 13, "[\"inspections\"]" },
                    { "field-pm-count", "number", active, "PM Count", 25, "[\"assets\"]" },
                    { "field-pm1", "text", active, "PM-1 S/N", 18, "[\"installations\"]" },
                    { "field-pm2", "text", active, "PM-2 S/N", 19, "[\"installations\"]" },
                    { "field-pm3", "text", active, "PM-3 S/N", 20, "[\"installations\"]" },
                    { "field-pm4", "text", active, "PM-4 S/N", 21, "[\"installations\"]" },
                    { "field-priority", "text", active, "Priority", 15, "[\"issues\"]" },
                    { "field-products", "multi-select", active, "Products", 4, "[\"projects\",\"products\"]" },
                    { "field-progress", "percentage", active, "Progress", 10, "[\"installations\"]" },
                    { "field-project-type", "text", active, "Project Type", 2, "[\"projects\"]" },
                    { "field-role", "text", active, "Role", 33, "[\"users\"]" },
                    { "field-serial-number", "text", active, "Serial Number", 24, "[\"assets\"]" },
                    { "field-site-name", "text", active, "Site Name", 7, "[\"installations\"]" },
                    { "field-start-date", "date", active, "Start Date", 8, "[\"installations\",\"issues\"]" },
                    { "field-status", "text", active, "Status", 5, "[\"projects\",\"installations\",\"inspections\",\"issues\"]" },
                    { "field-uploaded-at", "date", active, "Uploaded At", 30, "[\"documents\"]" },
                    { "field-user-name", "text", active, "User Name", 31, "[\"users\"]" }
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
