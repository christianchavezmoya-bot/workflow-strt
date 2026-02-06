using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class SeedDemoCustomerAndSite : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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
