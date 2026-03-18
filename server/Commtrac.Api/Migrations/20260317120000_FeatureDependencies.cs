using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260317120000_FeatureDependencies")]
    public partial class FeatureDependencies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FeatureDependencies",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    FeatureId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    IsInventory = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: false),
                    CaptureFieldsJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    DefaultQty = table.Column<decimal>(type: "TEXT", nullable: false, defaultValue: 1m),
                    Unit = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    UnitPrice = table.Column<decimal>(type: "TEXT", nullable: false, defaultValue: 0m),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FeatureDependencies", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FeatureDependencies_FeatureId",
                table: "FeatureDependencies",
                column: "FeatureId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "FeatureDependencies");
        }
    }
}
