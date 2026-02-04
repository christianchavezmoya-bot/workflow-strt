using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class InstallationTabRows : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InstallationTabRows",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    TabId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    DataJson = table.Column<string>(type: "TEXT", nullable: false),
                    Position = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InstallationTabRows", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InstallationTabRows");
        }
    }
}
