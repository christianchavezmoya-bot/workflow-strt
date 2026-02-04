using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class FieldDefinitionLinkActions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ActionType",
                table: "FieldDefinitions",
                type: "TEXT",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LinkToFieldId",
                table: "FieldDefinitions",
                type: "TEXT",
                maxLength: 120,
                nullable: true);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-active",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-asset-id",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-comments",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-customer",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-document",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-document-type",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-email",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-finish-date",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-inspector",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-installer",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-issue",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-job-number",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-linked-to",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-machine-id",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-machine-type",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-office",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-owner",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-photos",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-pm-count",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-pm1",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-pm2",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-pm3",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-pm4",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-priority",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-products",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-progress",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-project-type",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-role",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-serial-number",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-name",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-start-date",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-status",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-uploaded-at",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-user-name",
                columns: new[] { "ActionType", "LinkToFieldId" },
                values: new object[] { null, null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ActionType",
                table: "FieldDefinitions");

            migrationBuilder.DropColumn(
                name: "LinkToFieldId",
                table: "FieldDefinitions");
        }
    }
}
