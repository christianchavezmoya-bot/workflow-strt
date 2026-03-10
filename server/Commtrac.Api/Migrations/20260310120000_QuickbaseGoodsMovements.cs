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
            migrationBuilder.Sql(@"
                ALTER TABLE QuickbaseSettings ADD COLUMN GoodsMovementsTableId TEXT NOT NULL DEFAULT '';
                ALTER TABLE QuickbaseSettings ADD COLUMN GoodsMovementsJobFid INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE QuickbaseSettings ADD COLUMN GoodsMovementsDirectionFid INTEGER NOT NULL DEFAULT 0;
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // SQLite does not support DROP COLUMN in older versions; leave as-is
        }
    }
}
