using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSiteCountry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Country",
                table: "Sites",
                type: "TEXT",
                maxLength: 100,
                nullable: true);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-customer-id",
                column: "SortOrder",
                value: 44);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-customer-industry",
                column: "SortOrder",
                value: 45);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-contact-email",
                column: "SortOrder",
                value: 42);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-contact-name",
                column: "SortOrder",
                value: 40);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-contact-phone",
                column: "SortOrder",
                value: 41);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-notes",
                column: "SortOrder",
                value: 43);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-state",
                column: "Name",
                value: "State");

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-zipcode",
                column: "SortOrder",
                value: 39);

            // See DynamicFieldsTables: "IsActive" is INTEGER, and InsertData needs a
            // provider-appropriate CLR value for it.
            object active = MigrationSql.IsPostgres(migrationBuilder) ? 1 : true;

            migrationBuilder.InsertData(
                table: "FieldDefinitions",
                columns: new[] { "Id", "ActionType", "FieldType", "IsActive", "LinkToFieldId", "Name", "SortOrder", "TablesJson" },
                values: new object[] { "field-site-country", null, "text", active, null, "Country", 38, "[\"sites\"]" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-country");

            migrationBuilder.DropColumn(
                name: "Country",
                table: "Sites");

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-customer-id",
                column: "SortOrder",
                value: 43);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-customer-industry",
                column: "SortOrder",
                value: 44);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-contact-email",
                column: "SortOrder",
                value: 41);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-contact-name",
                column: "SortOrder",
                value: 39);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-contact-phone",
                column: "SortOrder",
                value: 40);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-notes",
                column: "SortOrder",
                value: 42);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-state",
                column: "Name",
                value: "State/Country");

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-zipcode",
                column: "SortOrder",
                value: 38);
        }
    }
}
