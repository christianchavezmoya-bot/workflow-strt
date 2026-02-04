using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Customers",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    CustomerId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Office = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Customers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Installations",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    ProjectId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    InstallationNumber = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    InstallationId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: true),
                    InstallationName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    SiteLocation = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    SiteContactName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    SiteContactPhone = table.Column<string>(type: "TEXT", maxLength: 80, nullable: true),
                    SiteContactEmail = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    ScheduledStart = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    ScheduledEnd = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    ActualStart = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    ActualFinish = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    Status = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    AssignedTeam = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    AssignedUsers = table.Column<string>(type: "TEXT", nullable: false),
                    Office = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    InstallerNotes = table.Column<string>(type: "TEXT", maxLength: 800, nullable: true),
                    CustomerSignOffDate = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    CustomerSignOffContact = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Installations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Products",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Products", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Projects",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    CustomerName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    CustomerId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    JobNumber = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 800, nullable: false),
                    StartDate = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    FinishDate = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Office = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Region = table.Column<string>(type: "TEXT", maxLength: 120, nullable: true),
                    ProjectType = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    ApprovalDecision = table.Column<string>(type: "TEXT", maxLength: 80, nullable: true),
                    IsInstallationProject = table.Column<bool>(type: "INTEGER", nullable: false),
                    InstallationMode = table.Column<string>(type: "TEXT", maxLength: 80, nullable: true),
                    ProjectManager = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    ContractValue = table.Column<decimal>(type: "TEXT", nullable: true),
                    ProbabilityStage = table.Column<string>(type: "TEXT", maxLength: 120, nullable: true),
                    ProductIds = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Projects", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "QuickbaseSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Enabled = table.Column<bool>(type: "INTEGER", nullable: false),
                    RealmHostname = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    UserToken = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    ProjectsTableId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    InstallationsTableId = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    ProjectsFieldMapJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "{}"),
                    InstallationsFieldMapJson = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "{}")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuickbaseSettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Email = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    FullName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Role = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Office = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    IsFirstLogin = table.Column<bool>(type: "INTEGER", nullable: false),
                    PasswordHash = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Customers");

            migrationBuilder.DropTable(
                name: "Installations");

            migrationBuilder.DropTable(
                name: "Products");

            migrationBuilder.DropTable(
                name: "Projects");

            migrationBuilder.DropTable(
                name: "QuickbaseSettings");

            migrationBuilder.DropTable(
                name: "Users");
        }
    }
}
