using System;
using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260308100000_ProjectContactsAndDelivery")]
    public partial class ProjectContactsAndDelivery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS ProjectContacts (
                    Id                  TEXT PRIMARY KEY NOT NULL,
                    ProjectId           TEXT NOT NULL DEFAULT '',
                    Name                TEXT NOT NULL DEFAULT '',
                    Title               TEXT NULL,
                    Email               TEXT NULL,
                    Phone               TEXT NULL,
                    PreferredSignMethod TEXT NOT NULL DEFAULT 'email',
                    IsPrimarySigner     INTEGER NOT NULL DEFAULT 0,
                    CcReports           INTEGER NOT NULL DEFAULT 0,
                    CreatedAt           TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
                )
            ");

            migrationBuilder.Sql(@"
                CREATE INDEX IF NOT EXISTS IX_ProjectContacts_ProjectId
                ON ProjectContacts (ProjectId)
            ");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS ProjectDeliveryProfiles (
                    Id            TEXT PRIMARY KEY NOT NULL,
                    ProjectId     TEXT NOT NULL DEFAULT '',
                    Label         TEXT NOT NULL DEFAULT '',
                    ContactName   TEXT NULL,
                    ContactPhone  TEXT NULL,
                    ContactEmail  TEXT NULL,
                    AddressLine1  TEXT NULL,
                    AddressLine2  TEXT NULL,
                    City          TEXT NULL,
                    State         TEXT NULL,
                    PostCode      TEXT NULL,
                    Country       TEXT NULL,
                    DeliveryNotes TEXT NULL,
                    AccessHours   TEXT NULL,
                    IsDefault     INTEGER NOT NULL DEFAULT 0,
                    CreatedAt     TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
                )
            ");

            migrationBuilder.Sql(@"
                CREATE INDEX IF NOT EXISTS IX_ProjectDeliveryProfiles_ProjectId
                ON ProjectDeliveryProfiles (ProjectId)
            ");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS ProjectInboundItems (
                    Id              TEXT PRIMARY KEY NOT NULL,
                    ProjectId       TEXT NOT NULL DEFAULT '',
                    Description     TEXT NOT NULL DEFAULT '',
                    Quantity        REAL NOT NULL DEFAULT 1,
                    Unit            TEXT NULL,
                    Condition       TEXT NOT NULL DEFAULT 'Good',
                    ReferenceNumber TEXT NULL,
                    ReceivedDate    TEXT NULL,
                    ReceivedBy      TEXT NULL,
                    Notes           TEXT NULL,
                    ItemType        TEXT NOT NULL DEFAULT 'Part',
                    CreatedAt       TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
                )
            ");

            migrationBuilder.Sql(@"
                CREATE INDEX IF NOT EXISTS IX_ProjectInboundItems_ProjectId
                ON ProjectInboundItems (ProjectId)
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TABLE IF EXISTS ProjectContacts");
            migrationBuilder.Sql("DROP TABLE IF EXISTS ProjectDeliveryProfiles");
            migrationBuilder.Sql("DROP TABLE IF EXISTS ProjectInboundItems");
        }
    }
}
