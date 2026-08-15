using Microsoft.EntityFrameworkCore.Migrations;

namespace Commtrac.Api.Data;

/// <summary>
/// Helpers for raw SQL in EF migrations shared by SQLite and Postgres.
/// Postgres folds unquoted identifiers to lowercase; EF creates quoted PascalCase tables.
/// </summary>
internal static class MigrationSql
{
    internal static bool IsPostgres(MigrationBuilder builder) =>
        string.Equals(builder.ActiveProvider, "Npgsql.EntityFrameworkCore.PostgreSQL", StringComparison.Ordinal);

    internal static bool IsSqlite(MigrationBuilder builder) =>
        string.Equals(builder.ActiveProvider, "Microsoft.EntityFrameworkCore.Sqlite", StringComparison.Ordinal);

    /// <summary>Double-quote a SQL identifier (works on SQLite and Postgres).</summary>
    internal static string Q(string identifier) => $"\"{identifier}\"";

    /// <summary>SQL literal for TRUE — Postgres boolean vs SQLite integer.</summary>
    internal static string BoolTrue(MigrationBuilder builder) =>
        IsPostgres(builder) ? "true" : "1";

    /// <summary>SQL literal for FALSE — Postgres boolean vs SQLite integer.</summary>
    internal static string BoolFalse(MigrationBuilder builder) =>
        IsPostgres(builder) ? "false" : "0";

    /// <summary>SQL CASE expression yielding a boolean column value.</summary>
    internal static string BoolCase(MigrationBuilder builder, string condition) =>
        IsPostgres(builder)
            ? $"CASE WHEN {condition} THEN true ELSE false END"
            : $"CASE WHEN {condition} THEN 1 ELSE 0 END";

    /// <summary>
    /// <c>ALTER TABLE … ADD COLUMN</c>, with <c>IF NOT EXISTS</c> only where supported.
    /// Postgres accepts it; SQLite has no such form and raises a syntax error.
    /// </summary>
    internal static string AddColumn(MigrationBuilder builder, string quotedTable, string columnDefinition)
    {
        var guard = IsPostgres(builder) ? "IF NOT EXISTS " : string.Empty;
        return $"ALTER TABLE {quotedTable} ADD COLUMN {guard}{columnDefinition}";
    }
}
