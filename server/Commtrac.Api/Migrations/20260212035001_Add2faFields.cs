using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class Add2faFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Is2faEnabled",
                table: "Users",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "TotpSecret",
                table: "Users",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RecoveryCodesJson",
                table: "Users",
                type: "TEXT",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-office",
                column: "Name",
                value: "Global Offices");

            // Use ON CONFLICT for idempotent seed (SQLite 3.24+ and Postgres)
            var fieldDefs = MigrationSql.Q("FieldDefinitions");
            var active = MigrationSql.BoolTrue(migrationBuilder);
            migrationBuilder.Sql($@"
                INSERT INTO {fieldDefs} (""Id"", ""ActionType"", ""FieldType"", ""IsActive"", ""LinkToFieldId"", ""Name"", ""SortOrder"", ""TablesJson"")
                VALUES
                    ('field-customer-id', NULL, 'text', {active}, NULL, 'Customer ID', 43, '[""customers""]'),
                    ('field-customer-industry', NULL, 'text', {active}, NULL, 'Industry', 44, '[""customers""]'),
                    ('field-site-address', NULL, 'text', {active}, NULL, 'Address', 35, '[""sites""]'),
                    ('field-site-city', NULL, 'text', {active}, NULL, 'City', 36, '[""sites""]'),
                    ('field-site-contact-email', NULL, 'email', {active}, NULL, 'Contact Email', 41, '[""sites""]'),
                    ('field-site-contact-name', NULL, 'text', {active}, NULL, 'Contact Name', 39, '[""sites""]'),
                    ('field-site-contact-phone', NULL, 'text', {active}, NULL, 'Contact Phone', 40, '[""sites""]'),
                    ('field-site-notes', NULL, 'text', {active}, NULL, 'Notes', 42, '[""sites""]'),
                    ('field-site-state', NULL, 'text', {active}, NULL, 'State/Country', 37, '[""sites""]'),
                    ('field-site-zipcode', NULL, 'text', {active}, NULL, 'Zip Code', 38, '[""sites""]')
                ON CONFLICT (""Id"") DO NOTHING;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-customer-id");

            migrationBuilder.DeleteData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-customer-industry");

            migrationBuilder.DeleteData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-address");

            migrationBuilder.DeleteData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-city");

            migrationBuilder.DeleteData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-contact-email");

            migrationBuilder.DeleteData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-contact-name");

            migrationBuilder.DeleteData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-contact-phone");

            migrationBuilder.DeleteData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-notes");

            migrationBuilder.DeleteData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-state");

            migrationBuilder.DeleteData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-site-zipcode");

            migrationBuilder.UpdateData(
                table: "FieldDefinitions",
                keyColumn: "Id",
                keyValue: "field-office",
                column: "Name",
                value: "Office");

            migrationBuilder.DropColumn(
                name: "Is2faEnabled",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "TotpSecret",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "RecoveryCodesJson",
                table: "Users");
        }
    }
}
