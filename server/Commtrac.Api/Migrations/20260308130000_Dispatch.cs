using System;
using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260308130000_Dispatch")]
    public partial class Dispatch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var dispatchOrders = MigrationSql.Q("DispatchOrders");
            var dispatchLines = MigrationSql.Q("DispatchLines");
            var deliveryEvents = MigrationSql.Q("DeliveryEvents");

            migrationBuilder.Sql($@"
                CREATE TABLE IF NOT EXISTS {dispatchOrders} (
                    ""Id""                TEXT PRIMARY KEY NOT NULL,
                    ""ProjectId""         TEXT NOT NULL DEFAULT '',
                    ""DeliveryProfileId"" TEXT NULL,
                    ""RequestedByName""   TEXT NULL,
                    ""NeededByDate""      TEXT NULL,
                    ""Priority""          TEXT NOT NULL DEFAULT 'Normal',
                    ""Status""            TEXT NOT NULL DEFAULT 'Draft',
                    ""Carrier""           TEXT NULL,
                    ""TrackingNumber""    TEXT NULL,
                    ""TrackingUrl""       TEXT NULL,
                    ""InternalNotes""     TEXT NULL,
                    ""CreatedAt""         TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    ""UpdatedAt""         TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
                )
            ");

            migrationBuilder.Sql($@"CREATE INDEX IF NOT EXISTS ""IX_DispatchOrders_ProjectId"" ON {dispatchOrders} (""ProjectId"")");
            migrationBuilder.Sql($@"CREATE INDEX IF NOT EXISTS ""IX_DispatchOrders_Status"" ON {dispatchOrders} (""Status"")");

            migrationBuilder.Sql($@"
                CREATE TABLE IF NOT EXISTS {dispatchLines} (
                    ""Id""                TEXT PRIMARY KEY NOT NULL,
                    ""OrderId""           TEXT NOT NULL DEFAULT '',
                    ""Description""       TEXT NOT NULL DEFAULT '',
                    ""PartNumber""        TEXT NULL,
                    ""QuantityRequested"" REAL NOT NULL DEFAULT 1,
                    ""QuantityShipped""   REAL NOT NULL DEFAULT 0,
                    ""Unit""              TEXT NULL,
                    ""UnitCost""          REAL NULL,
                    ""IsBillable""        INTEGER NOT NULL DEFAULT 1,
                    ""TaxCode""           TEXT NULL,
                    ""Notes""             TEXT NULL
                )
            ");

            migrationBuilder.Sql($@"CREATE INDEX IF NOT EXISTS ""IX_DispatchLines_OrderId"" ON {dispatchLines} (""OrderId"")");

            migrationBuilder.Sql($@"
                CREATE TABLE IF NOT EXISTS {deliveryEvents} (
                    ""Id""             TEXT PRIMARY KEY NOT NULL,
                    ""OrderId""        TEXT NOT NULL DEFAULT '',
                    ""EventType""      TEXT NOT NULL DEFAULT '',
                    ""OccurredAtUtc""  TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    ""Location""       TEXT NULL,
                    ""Notes""          TEXT NULL,
                    ""RecordedBy""     TEXT NULL
                )
            ");

            migrationBuilder.Sql($@"CREATE INDEX IF NOT EXISTS ""IX_DeliveryEvents_OrderId"" ON {deliveryEvents} (""OrderId"")");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql($"DROP TABLE IF EXISTS {MigrationSql.Q("DeliveryEvents")}");
            migrationBuilder.Sql($"DROP TABLE IF EXISTS {MigrationSql.Q("DispatchLines")}");
            migrationBuilder.Sql($"DROP TABLE IF EXISTS {MigrationSql.Q("DispatchOrders")}");
        }
    }
}
