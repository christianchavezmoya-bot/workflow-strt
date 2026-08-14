using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260309100000_ContactAddress")]
    public partial class ContactAddress : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var projectContacts = MigrationSql.Q("ProjectContacts");
            migrationBuilder.Sql($@"
                ALTER TABLE {projectContacts} ADD COLUMN IF NOT EXISTS ""Address"" TEXT NULL;
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // SQLite does not support DROP COLUMN in older versions; leave as-is
        }
    }
}
