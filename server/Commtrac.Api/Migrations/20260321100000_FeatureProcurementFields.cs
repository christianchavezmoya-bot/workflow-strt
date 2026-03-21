using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations;

public partial class FeatureProcurementFields : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "Brand",
            table: "Features",
            type: "TEXT",
            maxLength: 200,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "Supplier",
            table: "Features",
            type: "TEXT",
            maxLength: 200,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "AlternativePartNumber",
            table: "Features",
            type: "TEXT",
            maxLength: 200,
            nullable: true);

        migrationBuilder.AddColumn<decimal>(
            name: "UnitPrice",
            table: "Features",
            type: "TEXT",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "ProductLink",
            table: "Features",
            type: "TEXT",
            maxLength: 1000,
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "Brand",                 table: "Features");
        migrationBuilder.DropColumn(name: "Supplier",              table: "Features");
        migrationBuilder.DropColumn(name: "AlternativePartNumber", table: "Features");
        migrationBuilder.DropColumn(name: "UnitPrice",             table: "Features");
        migrationBuilder.DropColumn(name: "ProductLink",           table: "Features");
    }
}
