using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Commtrac.Api.Data;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260603140000_ArchiveAndRecovery")]
    public partial class ArchiveAndRecovery : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Soft-delete columns already exist in the live SQLite schema.
            // This migration only registers the archive/recovery feature on the current mainline.
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
