using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    public partial class AnalyticsEvents : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                CREATE TABLE IF NOT EXISTS AnalyticsEvents (
                    Id              TEXT PRIMARY KEY NOT NULL,
                    EventName       TEXT NOT NULL DEFAULT '',
                    UserId          TEXT NULL,
                    Role            TEXT NULL,
                    PayloadJson     TEXT NOT NULL DEFAULT '{}',
                    OccurredAtUtc   TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    ReceivedAtUtc   TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
                );
                CREATE INDEX IF NOT EXISTS IX_AnalyticsEvents_EventName    ON AnalyticsEvents (EventName);
                CREATE INDEX IF NOT EXISTS IX_AnalyticsEvents_UserId        ON AnalyticsEvents (UserId);
                CREATE INDEX IF NOT EXISTS IX_AnalyticsEvents_OccurredAtUtc ON AnalyticsEvents (OccurredAtUtc);
                """
            );
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TABLE IF EXISTS AnalyticsEvents;");
        }
    }
}
