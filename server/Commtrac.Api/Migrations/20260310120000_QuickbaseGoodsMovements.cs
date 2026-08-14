using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260310120000_QuickbaseGoodsMovements")]
    public partial class QuickbaseGoodsMovements : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var quickbaseSettings = MigrationSql.Q("QuickbaseSettings");
            migrationBuilder.Sql($@"ALTER TABLE {quickbaseSettings} ADD COLUMN IF NOT EXISTS ""GoodsMovementsTableId"" TEXT NOT NULL DEFAULT '';");
            migrationBuilder.Sql($@"ALTER TABLE {quickbaseSettings} ADD COLUMN IF NOT EXISTS ""GoodsMovementsJobFid"" INTEGER NOT NULL DEFAULT 0;");
            migrationBuilder.Sql($@"ALTER TABLE {quickbaseSettings} ADD COLUMN IF NOT EXISTS ""GoodsMovementsDirectionFid"" INTEGER NOT NULL DEFAULT 0;");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // SQLite does not support DROP COLUMN in older versions; leave as-is
        }
    }
}
