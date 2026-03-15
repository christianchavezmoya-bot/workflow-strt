using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Commtrac.Api.Data;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260314100000_ProjectAssetInstallationFields")]
    public partial class ProjectAssetInstallationFields : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TABLE ProjectAssets ADD COLUMN ConfigLabel TEXT NULL;");
            migrationBuilder.Sql("ALTER TABLE ProjectAssets ADD COLUMN InstalledAt TEXT NULL;");
            migrationBuilder.Sql("ALTER TABLE ProjectAssets ADD COLUMN InstalledBy TEXT NULL;");
        }

        protected override void Down(MigrationBuilder migrationBuilder) { }
    }
}
