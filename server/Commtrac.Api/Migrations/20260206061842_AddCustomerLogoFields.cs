using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerLogoFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Industry",
                table: "Customers",
                type: "TEXT",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Logo",
                table: "Customers",
                type: "TEXT",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LogoShape",
                table: "Customers",
                type: "TEXT",
                maxLength: 40,
                nullable: false,
                defaultValue: "round");

            migrationBuilder.AddColumn<int>(
                name: "PhotoScale",
                table: "Customers",
                type: "INTEGER",
                nullable: false,
                defaultValue: 100);

            migrationBuilder.AddColumn<int>(
                name: "LogoSize",
                table: "Customers",
                type: "INTEGER",
                nullable: false,
                defaultValue: 70);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Industry",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "Logo",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "LogoShape",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "PhotoScale",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "LogoSize",
                table: "Customers");
        }
    }
}
