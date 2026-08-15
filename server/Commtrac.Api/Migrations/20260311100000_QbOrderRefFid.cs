using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260311100000_QbOrderRefFid")]
    public partial class QbOrderRefFid : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var quickbaseSettings = MigrationSql.Q("QuickbaseSettings");
            migrationBuilder.Sql(MigrationSql.AddColumn(
                migrationBuilder, quickbaseSettings, @"""GoodsMovementsOrderRefFid"" INTEGER NOT NULL DEFAULT 0"));
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // SQLite does not support DROP COLUMN in older versions; leave as-is
        }
    }
}
