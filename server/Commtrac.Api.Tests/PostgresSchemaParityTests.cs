using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Optional Postgres parity test — runs only when COMMTRAC_POSTGRES_TEST=1.
///
/// The migration chain declares SQLite storage types verbatim (TEXT, INTEGER, REAL), so a Postgres
/// database can end up with columns Npgsql refuses to read into the model's CLR types, and startup
/// only fails once something actually queries the table. This compares every mapped property
/// against information_schema after migrations plus <see cref="PostgresSchemaEnsurer"/>, so a
/// missing column or a type the model cannot read fails here instead of at runtime.
/// </summary>
[Collection(PostgresTestCollection.Name)]
public class PostgresSchemaParityTests
{
    [Fact]
    public void Every_mapped_property_has_a_readable_postgres_column()
    {
        if (!string.Equals(Environment.GetEnvironmentVariable("COMMTRAC_POSTGRES_TEST"), "1", StringComparison.Ordinal))
        {
            return;
        }

        var connectionString = Environment.GetEnvironmentVariable("COMMTRAC_POSTGRES_CONNECTION")
            ?? "Host=localhost;Port=5432;Database=commtrac;Username=commtrac;Password=commtrac_dev";

        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connectionString)
            .Options);

        db.Database.EnsureDeleted();
        db.Database.Migrate();
        PostgresSchemaEnsurer.EnsureSchema(db);

        var columnTypes = ReadColumnTypes(db);
        var problems = new List<string>();

        foreach (var entityType in db.Model.GetEntityTypes())
        {
            var table = entityType.GetTableName();
            if (table is null) continue;

            foreach (var property in entityType.GetProperties())
            {
                var key = $"{table}.{property.GetColumnName()}";
                if (!columnTypes.TryGetValue(key, out var dbType))
                {
                    problems.Add($"missing column {key} ({property.ClrType.Name})");
                    continue;
                }

                // The provider type is what Npgsql actually reads, after any value converter.
                var providerType = property.GetValueConverter()?.ProviderClrType ?? property.ClrType;
                providerType = Nullable.GetUnderlyingType(providerType) ?? providerType;

                if (!IsReadable(providerType.Name, dbType))
                {
                    problems.Add($"{key}: model reads {providerType.Name} but column is {dbType}");
                }
            }
        }

        Assert.True(problems.Count == 0, string.Join(Environment.NewLine, problems));
    }

    private static Dictionary<string, string> ReadColumnTypes(AppDbContext db)
    {
        var types = new Dictionary<string, string>(StringComparer.Ordinal);
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                SELECT table_name, column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = 'public';
                """;
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                types[$"{reader.GetString(0)}.{reader.GetString(1)}"] = reader.GetString(2);
            }
        }
        finally
        {
            conn.Close();
        }

        return types;
    }

    private static bool IsReadable(string providerTypeName, string dbType) => (providerTypeName, dbType) switch
    {
        ("String", "text" or "character varying" or "jsonb") => true,
        ("Int32" or "Int64", "integer" or "bigint" or "smallint") => true,
        ("Boolean", "boolean") => true,
        ("DateTime", "timestamp with time zone" or "timestamp without time zone") => true,
        ("Decimal", "numeric") => true,
        ("Double" or "Single", "double precision" or "real" or "numeric") => true,
        ("Guid", "uuid") => true,
        ("Byte[]", "bytea") => true,
        _ => false
    };
}
