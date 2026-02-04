using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class FileUploadsAndNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CustomFieldsJson",
                table: "Installations",
                type: "TEXT",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<string>(
                name: "MachineType",
                table: "Installations",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Pm1Serial",
                table: "Installations",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Pm2Serial",
                table: "Installations",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Pm3Serial",
                table: "Installations",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Pm4Serial",
                table: "Installations",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContentType",
                table: "Documents",
                type: "TEXT",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FilePath",
                table: "Documents",
                type: "TEXT",
                maxLength: 400,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "FileSize",
                table: "Documents",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    FieldType = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Scope = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Product = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    OptionsJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomFieldDefinitions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InspectionPhotos",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    InspectionId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    FileName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    FilePath = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 120, nullable: true),
                    FileSize = table.Column<long>(type: "INTEGER", nullable: true),
                    UploadedAt = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InspectionPhotos", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CustomFieldDefinitions");

            migrationBuilder.DropTable(
                name: "InspectionPhotos");

            migrationBuilder.DropColumn(
                name: "CustomFieldsJson",
                table: "Installations");

            migrationBuilder.DropColumn(
                name: "MachineType",
                table: "Installations");

            migrationBuilder.DropColumn(
                name: "Pm1Serial",
                table: "Installations");

            migrationBuilder.DropColumn(
                name: "Pm2Serial",
                table: "Installations");

            migrationBuilder.DropColumn(
                name: "Pm3Serial",
                table: "Installations");

            migrationBuilder.DropColumn(
                name: "Pm4Serial",
                table: "Installations");

            migrationBuilder.DropColumn(
                name: "ContentType",
                table: "Documents");

            migrationBuilder.DropColumn(
                name: "FilePath",
                table: "Documents");

            migrationBuilder.DropColumn(
                name: "FileSize",
                table: "Documents");
        }
    }
}
