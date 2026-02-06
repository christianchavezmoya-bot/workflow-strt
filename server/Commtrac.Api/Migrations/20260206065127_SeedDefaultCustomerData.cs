using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class SeedDefaultCustomerData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "PhotoScale",
                table: "Customers",
                type: "INTEGER",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "INTEGER",
                oldDefaultValue: 100);

            migrationBuilder.AlterColumn<int>(
                name: "LogoSize",
                table: "Customers",
                type: "INTEGER",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "INTEGER",
                oldDefaultValue: 70);

            migrationBuilder.AlterColumn<string>(
                name: "LogoShape",
                table: "Customers",
                type: "TEXT",
                maxLength: 40,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "TEXT",
                oldMaxLength: 40,
                oldDefaultValue: "round");

            // Seed a default customer
            migrationBuilder.InsertData(
                table: "Customers",
                columns: new[] { "Id", "Name", "CustomerId", "Office", "Industry", "Logo", "LogoShape", "PhotoScale", "LogoSize" },
                values: new object[] { "demo-customer-001", "Acme Corporation", "CUST-001", "USA", "Manufacturing", null, "round", 100, 70 }
            );

            // Seed a default site for the customer
            migrationBuilder.InsertData(
                table: "Sites",
                columns: new[] { "Id", "CustomerId", "Name", "Address", "City", "State", "ZipCode", "ContactName", "ContactPhone", "ContactEmail", "Notes", "CreatedAt" },
                values: new object[] { "demo-site-001", "demo-customer-001", "Main Office", "123 Business Ave", "New York", "NY", "10001", "John Doe", "(555) 123-4567", "john.doe@acme.com", "Headquarters location", DateTime.UtcNow }
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "PhotoScale",
                table: "Customers",
                type: "INTEGER",
                nullable: false,
                defaultValue: 100,
                oldClrType: typeof(int),
                oldType: "INTEGER");

            migrationBuilder.AlterColumn<int>(
                name: "LogoSize",
                table: "Customers",
                type: "INTEGER",
                nullable: false,
                defaultValue: 70,
                oldClrType: typeof(int),
                oldType: "INTEGER");

            migrationBuilder.AlterColumn<string>(
                name: "LogoShape",
                table: "Customers",
                type: "TEXT",
                maxLength: 40,
                nullable: false,
                defaultValue: "round",
                oldClrType: typeof(string),
                oldType: "TEXT",
                oldMaxLength: 40);

            // Remove seed data
            migrationBuilder.DeleteData(
                table: "Sites",
                keyColumn: "Id",
                keyValue: "demo-site-001"
            );

            migrationBuilder.DeleteData(
                table: "Customers",
                keyColumn: "Id",
                keyValue: "demo-customer-001"
            );
        }
    }
}
