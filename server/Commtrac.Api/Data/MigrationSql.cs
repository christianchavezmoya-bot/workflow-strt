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
