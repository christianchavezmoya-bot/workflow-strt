using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <summary>
    /// Reconciles notification inbox schema drift for databases where the original
    /// NotificationInbox migration was recorded but did not create the table.
    /// </summary>
    public partial class ReconcileNotificationInbox : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var notificationInbox = MigrationSql.Q("NotificationInbox");
            migrationBuilder.Sql(
                $"""
                CREATE TABLE IF NOT EXISTS {notificationInbox} (
                    "Id" TEXT PRIMARY KEY NOT NULL,
                    "RecipientUserId" TEXT NULL,
                    "RecipientRole" TEXT NULL,
                    "EventType" TEXT NOT NULL DEFAULT '',
                    "Severity" TEXT NOT NULL DEFAULT 'info',
                    "Title" TEXT NOT NULL DEFAULT '',
                    "Message" TEXT NOT NULL DEFAULT '',
                    "ProjectId" TEXT NULL,
                    "AssetId" TEXT NULL,
                    "RunId" TEXT NULL,
                    "EntityType" TEXT NULL,
                    "EntityId" TEXT NULL,
                    "TriggeredByUserId" TEXT NULL,
                    "TriggeredByName" TEXT NULL,
                    "CreatedAtUtc" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    "ReadAtUtc" TEXT NULL,
                    "ReadByUserId" TEXT NULL
                );
                CREATE INDEX IF NOT EXISTS "IX_NotificationInbox_RecipientUserId" ON {notificationInbox} ("RecipientUserId");
                CREATE INDEX IF NOT EXISTS "IX_NotificationInbox_RecipientRole" ON {notificationInbox} ("RecipientRole");
                CREATE INDEX IF NOT EXISTS "IX_NotificationInbox_CreatedAtUtc" ON {notificationInbox} ("CreatedAtUtc");
                """
            );
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql($"DROP TABLE IF EXISTS {MigrationSql.Q("NotificationInbox")};");
        }
    }
}
