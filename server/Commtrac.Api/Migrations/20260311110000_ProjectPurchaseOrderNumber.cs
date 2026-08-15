using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260311110000_ProjectPurchaseOrderNumber")]
    public partial class ProjectPurchaseOrderNumber : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var projects = MigrationSql.Q("Projects");
            migrationBuilder.Sql(MigrationSql.AddColumn(
                migrationBuilder, projects, @"""PurchaseOrderNumber"" TEXT NOT NULL DEFAULT ''"));
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // SQLite does not support DROP COLUMN in older versions; leave as-is
        }
    }
}
