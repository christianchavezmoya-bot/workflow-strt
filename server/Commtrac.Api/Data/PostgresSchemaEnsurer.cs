using System.Data.Common;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Data;

/// <summary>
/// PostgreSQL equivalents of the SQLite-only Ensure* patches in DbInitializer.
/// Uses idempotent DDL (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) so a fresh Postgres
/// database survives the same schema/history gaps as local SQLite dev.
/// </summary>
public static class PostgresSchemaEnsurer
{
    public static void EnsureSchema(AppDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            EnsurePerformanceIndexes(conn);
            EnsureAuditLogTable(conn);
            EnsureSessionsTable(conn);
            EnsurePasswordChangedAtColumn(conn);
            EnsureMobileUploadTokensTable(conn);
            EnsureDocumentTables(conn);
            EnsureAssetDocumentTables(conn);
            EnsureAssetDocumentLinksTables(conn);
            EnsureRunTimeTrackingColumns(conn);
            EnsureMarch15Columns(conn);
            EnsureFeatureProcurementColumns(conn);
            EnsureProjectMinimumCompletionPercentColumn(conn);
            EnsureProjectTimeZoneColumn(conn);
            EnsureInspectionImportColumnNames(conn);
            EnsureNotificationInboxTable(conn);
            EnsureRunAmendmentSchema(conn);
            EnsureSoftDeleteColumns(conn);
            EnsurePushDeviceTokensTable(conn);
            EnsureScheduledReportColumn(conn);
            EnsureSignatureTokenSignerRoleColumn(conn);
            EnsureFaultReportsTable(conn);
            EnsureDecimalColumnTypes(conn);
        }
        finally
        {
            conn.Close();
        }
    }

    private static void ExecuteNonQuery(DbConnection conn, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    private static void EnsurePerformanceIndexes(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            CREATE INDEX IF NOT EXISTS "IX_ProjectAssets_ProjectId_AssetTag"
                ON "ProjectAssets" ("ProjectId", "AssetTag");
            CREATE INDEX IF NOT EXISTS "IX_AssetWorkflowRuns_AssetId_ConfigId_StartedAt"
                ON "AssetWorkflowRuns" ("AssetId", "WorkflowConfigId", "StartedAt" DESC);
            CREATE INDEX IF NOT EXISTS "IX_AssetWorkflowRuns_AssetId_StartedAt"
                ON "AssetWorkflowRuns" ("AssetId", "StartedAt" DESC);
            """);
    }

    private static void EnsureAuditLogTable(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            CREATE TABLE IF NOT EXISTS "AuditLogs" (
                "Id" TEXT PRIMARY KEY NOT NULL,
                "UserId" TEXT NOT NULL DEFAULT '',
                "UserEmail" TEXT NOT NULL DEFAULT '',
                "Action" TEXT NOT NULL DEFAULT '',
                "Details" TEXT,
                "IpAddress" TEXT,
                "Timestamp" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
            );
            CREATE INDEX IF NOT EXISTS "IX_AuditLogs_UserId" ON "AuditLogs" ("UserId");
            CREATE INDEX IF NOT EXISTS "IX_AuditLogs_Timestamp" ON "AuditLogs" ("Timestamp");
            """);
    }

    private static void EnsureSessionsTable(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            CREATE TABLE IF NOT EXISTS "Sessions" (
                "Id" TEXT PRIMARY KEY NOT NULL,
                "UserId" TEXT NOT NULL DEFAULT '',
                "UserEmail" TEXT NOT NULL DEFAULT '',
                "IpAddress" TEXT,
                "UserAgent" TEXT,
                "CreatedAt" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                "LastActiveAt" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                "IsRevoked" INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS "IX_Sessions_UserId" ON "Sessions" ("UserId");
            """);
    }

    private static void EnsurePasswordChangedAtColumn(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "PasswordChangedAt" TEXT;
            """);
    }

    private static void EnsureMobileUploadTokensTable(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            CREATE TABLE IF NOT EXISTS "MobileUploadTokens" (
                "Token" TEXT PRIMARY KEY NOT NULL,
                "Type" TEXT NOT NULL DEFAULT 'tips',
                "LinkedTo" TEXT NOT NULL DEFAULT '',
                "CustomValuesJson" TEXT,
                "Status" TEXT NOT NULL DEFAULT 'pending',
                "DocumentId" TEXT,
                "CreatedByUserId" TEXT,
                "CreatedAtUtc" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                "ExpiresAtUtc" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                "ConsumedAtUtc" TEXT
            );
            CREATE INDEX IF NOT EXISTS "IX_MobileUploadTokens_Status" ON "MobileUploadTokens" ("Status");
            CREATE INDEX IF NOT EXISTS "IX_MobileUploadTokens_ExpiresAtUtc" ON "MobileUploadTokens" ("ExpiresAtUtc");
            """);
    }

    private static void EnsureDocumentTables(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            ALTER TABLE "Documents" ADD COLUMN IF NOT EXISTS "CreatedBy" TEXT;
            ALTER TABLE "Documents" ADD COLUMN IF NOT EXISTS "Notes" TEXT;
            ALTER TABLE "Documents" ADD COLUMN IF NOT EXISTS "CustomValuesJson" TEXT;
            ALTER TABLE "Documents" ADD COLUMN IF NOT EXISTS "DownloadUrl" TEXT;
            CREATE TABLE IF NOT EXISTS "DocumentConfigs" (
                "Id" INTEGER PRIMARY KEY NOT NULL,
                "TabsJson" TEXT NOT NULL DEFAULT '[]',
                "FieldsJson" TEXT NOT NULL DEFAULT '[]'
            );
            """);
    }

    private static void EnsureAssetDocumentTables(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            CREATE TABLE IF NOT EXISTS "AssetDocuments" (
                "Id" TEXT PRIMARY KEY NOT NULL,
                "AssetId" TEXT NOT NULL DEFAULT '',
                "Label" TEXT NOT NULL DEFAULT 'Document',
                "CreatedBy" TEXT,
                "CreatedAt" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
            );
            CREATE INDEX IF NOT EXISTS "IX_AssetDocuments_AssetId" ON "AssetDocuments" ("AssetId");
            CREATE TABLE IF NOT EXISTS "AssetDocumentRevisions" (
                "Id" TEXT PRIMARY KEY NOT NULL,
                "DocumentId" TEXT NOT NULL DEFAULT '',
                "RevisionNumber" INTEGER NOT NULL DEFAULT 1,
                "OriginalName" TEXT NOT NULL DEFAULT '',
                "StoredName" TEXT NOT NULL DEFAULT '',
                "MimeType" TEXT NOT NULL DEFAULT '',
                "FileSizeBytes" INTEGER NOT NULL DEFAULT 0,
                "UploadedBy" TEXT,
                "UploadedAt" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
            );
            CREATE INDEX IF NOT EXISTS "IX_AssetDocumentRevisions_DocumentId"
                ON "AssetDocumentRevisions" ("DocumentId");
            """);
    }

    private static void EnsureAssetDocumentLinksTables(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            CREATE TABLE IF NOT EXISTS "AssetDocumentLinks" (
                "Id" TEXT PRIMARY KEY NOT NULL,
                "AssetId" TEXT NOT NULL DEFAULT '',
                "DocumentId" TEXT NOT NULL DEFAULT '',
                "AttachedBy" TEXT,
                "AttachedAt" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
            );
            CREATE INDEX IF NOT EXISTS "IX_AssetDocumentLinks_AssetId" ON "AssetDocumentLinks" ("AssetId");
            CREATE INDEX IF NOT EXISTS "IX_AssetDocumentLinks_DocumentId" ON "AssetDocumentLinks" ("DocumentId");
            """);
    }

    private static void EnsureRunTimeTrackingColumns(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            ALTER TABLE "AssetWorkflowRuns" ADD COLUMN IF NOT EXISTS "TimeTrackingJson" TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE "AssetWorkflowRuns" ADD COLUMN IF NOT EXISTS "ProductiveSeconds" INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE "AssetWorkflowRuns" ADD COLUMN IF NOT EXISTS "DowntimeSeconds" INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE "AssetWorkflowRuns" ADD COLUMN IF NOT EXISTS "DowntimeEvents" INTEGER NOT NULL DEFAULT 0;
            """);
    }

    private static void EnsureMarch15Columns(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            ALTER TABLE "ProjectAssets" ADD COLUMN IF NOT EXISTS "AsBuiltJson" TEXT NOT NULL DEFAULT '{}';
            ALTER TABLE "AssetWorkflowRuns" ADD COLUMN IF NOT EXISTS "BomActualJson" TEXT NOT NULL DEFAULT '[]';
            """);
    }

    private static void EnsureFeatureProcurementColumns(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            ALTER TABLE "Features" ADD COLUMN IF NOT EXISTS "Brand" TEXT;
            ALTER TABLE "Features" ADD COLUMN IF NOT EXISTS "Supplier" TEXT;
            ALTER TABLE "Features" ADD COLUMN IF NOT EXISTS "AlternativePartNumber" TEXT;
            ALTER TABLE "Features" ADD COLUMN IF NOT EXISTS "ManufacturerPartNumber" TEXT;
            ALTER TABLE "Features" ADD COLUMN IF NOT EXISTS "UnitPrice" TEXT;
            ALTER TABLE "Features" ADD COLUMN IF NOT EXISTS "ProductLink" TEXT;
            """);
    }

    private static void EnsureProjectMinimumCompletionPercentColumn(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            ALTER TABLE "Projects" ADD COLUMN IF NOT EXISTS "MinimumCompletionPercent" INTEGER NOT NULL DEFAULT 100;
            """);
    }

    private static void EnsureProjectTimeZoneColumn(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            ALTER TABLE "Projects" ADD COLUMN IF NOT EXISTS "TimeZoneId" TEXT;
            """);
    }

    private static void EnsureInspectionImportColumnNames(DbConnection conn)
    {
        if (!TableExists(conn, "InspectionImports")) return;

        RenameColumnIfNeeded(conn, "InspectionImports", "AssetId", "ProjectAssetId");
        RenameColumnIfNeeded(conn, "InspectionImports", "ErrorText", "Error");
        RenameColumnIfNeeded(conn, "InspectionImports", "ContentHash", "Hash");
    }

    private static void EnsureNotificationInboxTable(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            CREATE TABLE IF NOT EXISTS "NotificationInbox" (
                "Id" TEXT PRIMARY KEY NOT NULL,
                "RecipientUserId" TEXT,
                "RecipientRole" TEXT,
                "EventType" TEXT NOT NULL DEFAULT '',
                "Severity" TEXT NOT NULL DEFAULT 'info',
                "Title" TEXT NOT NULL DEFAULT '',
                "Message" TEXT NOT NULL DEFAULT '',
                "ProjectId" TEXT,
                "AssetId" TEXT,
                "RunId" TEXT,
                "EntityType" TEXT,
                "EntityId" TEXT,
                "TriggeredByUserId" TEXT,
                "TriggeredByName" TEXT,
                "CreatedAtUtc" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                "ReadAtUtc" TEXT,
                "ReadByUserId" TEXT
            );
            CREATE INDEX IF NOT EXISTS "IX_NotificationInbox_RecipientUserId" ON "NotificationInbox" ("RecipientUserId");
            CREATE INDEX IF NOT EXISTS "IX_NotificationInbox_RecipientRole" ON "NotificationInbox" ("RecipientRole");
            CREATE INDEX IF NOT EXISTS "IX_NotificationInbox_CreatedAtUtc" ON "NotificationInbox" ("CreatedAtUtc");
            """);
    }

    private static void EnsureRunAmendmentSchema(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            CREATE TABLE IF NOT EXISTS "RunAmendments" (
                "Id" TEXT PRIMARY KEY NOT NULL,
                "RunId" TEXT NOT NULL DEFAULT '',
                "AssetId" TEXT NOT NULL DEFAULT '',
                "Kind" TEXT NOT NULL DEFAULT 'capture-field',
                "StepId" TEXT,
                "InputId" TEXT,
                "IterationIndex" INTEGER,
                "FieldLabel" TEXT,
                "OldValue" TEXT,
                "NewValue" TEXT,
                "SignatureStatusAtAmend" TEXT NOT NULL DEFAULT 'None',
                "AmendedByUserId" TEXT,
                "AmendedByName" TEXT NOT NULL DEFAULT '',
                "AmendedByRole" TEXT,
                "AmendedAtUtc" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
            );
            CREATE INDEX IF NOT EXISTS "IX_RunAmendments_RunId" ON "RunAmendments" ("RunId");
            CREATE INDEX IF NOT EXISTS "IX_RunAmendments_AssetId" ON "RunAmendments" ("AssetId");
            CREATE INDEX IF NOT EXISTS "IX_RunAmendments_AmendedAtUtc" ON "RunAmendments" ("AmendedAtUtc");
            ALTER TABLE "AssetWorkflowRuns" ADD COLUMN IF NOT EXISTS "LastAmendedByName" TEXT;
            ALTER TABLE "AssetWorkflowRuns" ADD COLUMN IF NOT EXISTS "LastAmendedByRole" TEXT;
            ALTER TABLE "AssetWorkflowRuns" ADD COLUMN IF NOT EXISTS "LastAmendedAtUtc" TEXT;
            ALTER TABLE "AssetWorkflowRuns" ADD COLUMN IF NOT EXISTS "AmendmentCount" INTEGER NOT NULL DEFAULT 0;
            """);
    }

    private static void EnsureSoftDeleteColumns(DbConnection conn)
    {
        foreach (var table in new[] { "Projects", "Installations", "Documents", "ProjectAssets", "BomImportRuns" })
        {
            if (!TableExists(conn, table)) continue;
            ExecuteNonQuery(conn, $"""
                ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "IsDeleted" INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "DeletedAtUtc" TEXT;
                ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "DeletedByUserId" TEXT;
                ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "DeleteReason" TEXT;
                """);
        }
    }

    private static void EnsurePushDeviceTokensTable(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            CREATE TABLE IF NOT EXISTS "PushDeviceTokens" (
                "Id" TEXT PRIMARY KEY NOT NULL,
                "UserId" TEXT NOT NULL,
                "Token" TEXT NOT NULL,
                "Platform" TEXT NOT NULL DEFAULT 'unknown',
                "CreatedAtUtc" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                "UpdatedAtUtc" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PushDeviceTokens_Token" ON "PushDeviceTokens" ("Token");
            CREATE INDEX IF NOT EXISTS "IX_PushDeviceTokens_UserId" ON "PushDeviceTokens" ("UserId");
            """);
    }

    private static void EnsureScheduledReportColumn(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            ALTER TABLE "Projects" ADD COLUMN IF NOT EXISTS "ScheduledReportJson" TEXT;
            """);
    }

    private static void EnsureSignatureTokenSignerRoleColumn(DbConnection conn)
    {
        if (!TableExists(conn, "SignatureTokens")) return;
        ExecuteNonQuery(conn, """
            ALTER TABLE "SignatureTokens" ADD COLUMN IF NOT EXISTS "SignerRole" TEXT NOT NULL DEFAULT 'Customer';
            """);
    }

    private static void EnsureFaultReportsTable(DbConnection conn)
    {
        ExecuteNonQuery(conn, """
            CREATE TABLE IF NOT EXISTS "FaultReports" (
                "Id"               TEXT PRIMARY KEY NOT NULL,
                "ReferenceCode"    TEXT NOT NULL DEFAULT '',
                "Kind"             TEXT NOT NULL DEFAULT 'user-report',
                "Severity"         TEXT NOT NULL DEFAULT 'S2',
                "Status"           TEXT NOT NULL DEFAULT 'New',
                "Title"            TEXT NOT NULL DEFAULT '',
                "Description"      TEXT,
                "Platform"         TEXT NOT NULL DEFAULT 'web',
                "AppVersion"       TEXT,
                "UserAgent"        TEXT,
                "RoutePath"        TEXT,
                "UserId"           TEXT,
                "UserEmail"        TEXT,
                "UserRole"         TEXT,
                "ErrorName"        TEXT,
                "ErrorMessage"     TEXT,
                "ErrorStack"       TEXT,
                "TraceId"          TEXT,
                "BreadcrumbsJson"  TEXT,
                "DiagnosticsJson"  TEXT,
                "WasOffline"       INTEGER NOT NULL DEFAULT 0,
                "OccurredAtUtc"    TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                "CreatedAtUtc"     TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                "LastUpdatedAtUtc" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                "Notes"            TEXT,
                "ResolvedAtUtc"    TEXT,
                "ResolvedByUserId" TEXT,
                "LastUpdatedByUserId" TEXT
            );
            ALTER TABLE "FaultReports" ADD COLUMN IF NOT EXISTS "LastUpdatedAtUtc" TEXT NOT NULL DEFAULT '0001-01-01T00:00:00';
            ALTER TABLE "FaultReports" ADD COLUMN IF NOT EXISTS "LastUpdatedByUserId" TEXT;
            UPDATE "FaultReports"
            SET "LastUpdatedAtUtc" = COALESCE(NULLIF("LastUpdatedAtUtc", '0001-01-01T00:00:00'), "ResolvedAtUtc", "CreatedAtUtc")
            WHERE "LastUpdatedAtUtc" IS NULL OR "LastUpdatedAtUtc" = '0001-01-01T00:00:00';
            CREATE INDEX IF NOT EXISTS "IX_FaultReports_CreatedAtUtc" ON "FaultReports" ("CreatedAtUtc");
            CREATE INDEX IF NOT EXISTS "IX_FaultReports_LastUpdatedAtUtc" ON "FaultReports" ("LastUpdatedAtUtc");
            CREATE INDEX IF NOT EXISTS "IX_FaultReports_Status" ON "FaultReports" ("Status");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_FaultReports_ReferenceCode" ON "FaultReports" ("ReferenceCode");
            CREATE TABLE IF NOT EXISTS "FaultReportHistory" (
                "Id"               TEXT PRIMARY KEY NOT NULL,
                "FaultReportId"    TEXT NOT NULL DEFAULT '',
                "EventType"        TEXT NOT NULL DEFAULT 'Created',
                "PreviousStatus"   TEXT,
                "NewStatus"        TEXT NOT NULL DEFAULT 'New',
                "PreviousSeverity" TEXT,
                "NewSeverity"      TEXT NOT NULL DEFAULT 'S2',
                "PreviousNotes"    TEXT,
                "NewNotes"         TEXT,
                "Summary"          TEXT NOT NULL DEFAULT '',
                "ActorUserId"      TEXT,
                "ActorUserEmail"   TEXT,
                "ActorUserRole"    TEXT,
                "CreatedAtUtc"     TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
            );
            CREATE INDEX IF NOT EXISTS "IX_FaultReportHistory_FaultReportId_CreatedAtUtc"
                ON "FaultReportHistory" ("FaultReportId", "CreatedAtUtc");
            """);
    }

    /// <summary>
    /// Money and quantity columns were declared with SQLite storage types (TEXT or REAL), which
    /// Postgres takes literally, so EF cannot read them as <see cref="decimal"/>. Unlike dates and
    /// flags — bridged in the model, see AppDbContext — these are few and are used for arithmetic,
    /// so they get a real numeric type.
    /// </summary>
    private static void EnsureDecimalColumnTypes(DbConnection conn)
    {
        (string Table, string Column)[] columns =
        [
            ("Projects", "ContractValue"),
            ("Features", "UnitPrice"),
            ("FeatureDependencies", "UnitPrice"),
            ("FeatureDependencies", "DefaultQty"),
            ("ProjectInboundItems", "Quantity"),
            ("DispatchLines", "QuantityRequested"),
            ("DispatchLines", "QuantityShipped"),
            ("DispatchLines", "UnitCost"),
        ];

        foreach (var (table, column) in columns)
        {
            if (!TableExists(conn, table)) continue;
            var current = ColumnDataType(conn, table, column);
            if (current is null || current == "numeric") continue;

            // Empty strings are not valid numerics; treat them as NULL (or 0 for NOT NULL columns).
            var cast = current is "text" or "character varying"
                ? $@"NULLIF(TRIM(""{column}""), '')::numeric"
                : $@"""{column}""::numeric";

            ExecuteNonQuery(conn, $"""
                ALTER TABLE "{table}" ALTER COLUMN "{column}" DROP DEFAULT;
                ALTER TABLE "{table}" ALTER COLUMN "{column}" TYPE numeric USING {cast};
                """);
        }
    }

    private static string? ColumnDataType(DbConnection conn, string table, string column)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT data_type FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = @table AND column_name = @column;
            """;
        var tableParam = cmd.CreateParameter();
        tableParam.ParameterName = "@table";
        tableParam.Value = table;
        cmd.Parameters.Add(tableParam);
        var columnParam = cmd.CreateParameter();
        columnParam.ParameterName = "@column";
        columnParam.Value = column;
        cmd.Parameters.Add(columnParam);
        return cmd.ExecuteScalar() as string;
    }

    private static bool TableExists(DbConnection conn, string table)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT COUNT(*) FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = @table AND c.relkind = 'r';
            """;
        var p = cmd.CreateParameter();
        p.ParameterName = "@table";
        p.Value = table;
        cmd.Parameters.Add(p);
        return Convert.ToInt64(cmd.ExecuteScalar()) != 0;
    }

    private static bool ColumnExists(DbConnection conn, string table, string column)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = @table AND column_name = @column;
            """;
        var tableParam = cmd.CreateParameter();
        tableParam.ParameterName = "@table";
        tableParam.Value = table;
        cmd.Parameters.Add(tableParam);
        var columnParam = cmd.CreateParameter();
        columnParam.ParameterName = "@column";
        columnParam.Value = column;
        cmd.Parameters.Add(columnParam);
        return Convert.ToInt64(cmd.ExecuteScalar()) != 0;
    }

    private static void RenameColumnIfNeeded(DbConnection conn, string table, string legacy, string mapped)
    {
        if (ColumnExists(conn, table, mapped)) return;
        if (!ColumnExists(conn, table, legacy)) return;
        ExecuteNonQuery(conn, $"""ALTER TABLE "{table}" RENAME COLUMN "{legacy}" TO "{mapped}";""");
    }
}
