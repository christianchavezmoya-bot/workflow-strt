using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    public partial class RunTimeTracking : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DowntimeEvents",
                table: "AssetWorkflowRuns",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "DowntimeSeconds",
                table: "AssetWorkflowRuns",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ProductiveSeconds",
                table: "AssetWorkflowRuns",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "TimeTrackingJson",
                table: "AssetWorkflowRuns",
                type: "TEXT",
                nullable: false,
                defaultValue: "[]");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DowntimeEvents",
                table: "AssetWorkflowRuns");

            migrationBuilder.DropColumn(
                name: "DowntimeSeconds",
                table: "AssetWorkflowRuns");

            migrationBuilder.DropColumn(
                name: "ProductiveSeconds",
                table: "AssetWorkflowRuns");

            migrationBuilder.DropColumn(
                name: "TimeTrackingJson",
                table: "AssetWorkflowRuns");
        }
    }
}
