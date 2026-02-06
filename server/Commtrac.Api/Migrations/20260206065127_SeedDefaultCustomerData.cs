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
        }
    }
}
