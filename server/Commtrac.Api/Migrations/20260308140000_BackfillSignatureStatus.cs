using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260308140000_BackfillSignatureStatus")]
    public partial class BackfillSignatureStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var runs = MigrationSql.Q("AssetWorkflowRuns");
            migrationBuilder.Sql($@"
                UPDATE {runs}
                SET ""SignatureStatus"" = 'PendingInstaller'
                WHERE ""IsLocked"" = 1 AND ""SignatureStatus"" = 'None'
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            var runs = MigrationSql.Q("AssetWorkflowRuns");
            migrationBuilder.Sql($@"
                UPDATE {runs}
                SET ""SignatureStatus"" = 'None'
                WHERE ""IsLocked"" = 1 AND ""SignatureStatus"" = 'PendingInstaller'
                  AND ""InstallerSignedAt"" IS NULL
            ");
        }
    }
}
