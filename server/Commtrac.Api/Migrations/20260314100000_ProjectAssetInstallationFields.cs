using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260314100000_ProjectAssetInstallationFields")]
    public partial class ProjectAssetInstallationFields : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var projectAssets = MigrationSql.Q("ProjectAssets");
            migrationBuilder.Sql(MigrationSql.AddColumn(migrationBuilder, projectAssets, @"""ConfigLabel"" TEXT NULL"));
            migrationBuilder.Sql(MigrationSql.AddColumn(migrationBuilder, projectAssets, @"""InstalledAt"" TEXT NULL"));
            migrationBuilder.Sql(MigrationSql.AddColumn(migrationBuilder, projectAssets, @"""InstalledBy"" TEXT NULL"));
        }

        protected override void Down(MigrationBuilder migrationBuilder) { }
    }
}
