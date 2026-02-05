using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTableConfigs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TableConfigs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    TableName = table.Column<string>(type: "TEXT", nullable: false),
                    OrderJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    HiddenJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    BaseFieldNamesJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "{}")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TableConfigs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TableConfigs_TableName",
                table: "TableConfigs",
                column: "TableName",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TableConfigs");
        }
    }
}
