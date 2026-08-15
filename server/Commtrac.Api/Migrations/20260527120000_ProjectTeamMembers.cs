using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260527120000_ProjectTeamMembers")]
public partial class ProjectTeamMembers : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        var projects = MigrationSql.Q("Projects");
        migrationBuilder.Sql(MigrationSql.AddColumn(migrationBuilder, projects, """
            "TeamMemberIdsJson" TEXT NOT NULL DEFAULT '[]'
            """));
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // SQLite does not support DROP COLUMN — column is left in place on rollback.
    }
}
