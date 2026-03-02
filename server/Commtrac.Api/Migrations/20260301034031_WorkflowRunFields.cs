using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class WorkflowRunFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Add RunNumber — sequential run counter per asset+config pair.
            // Default 1 so historical runs that predate this migration have RunNumber = 1.
            migrationBuilder.AddColumn<int>(
                name: "RunNumber",
                table: "AssetWorkflowRuns",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);

            // Add CompletedByName — display name of the user who locked the run.
            migrationBuilder.AddColumn<string>(
                name: "CompletedByName",
                table: "AssetWorkflowRuns",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            // Create BrandSettings key/value table (logo stored as base64 under key="logo").
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS BrandSettings (
                    Key TEXT PRIMARY KEY NOT NULL,
                    Value TEXT NOT NULL DEFAULT '',
                    UpdatedAt TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
                )
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "BrandSettings");
            migrationBuilder.DropColumn(name: "RunNumber",       table: "AssetWorkflowRuns");
            migrationBuilder.DropColumn(name: "CompletedByName", table: "AssetWorkflowRuns");
        }
    }
}
