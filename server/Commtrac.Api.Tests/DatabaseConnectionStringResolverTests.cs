using Commtrac.Api.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Npgsql;
using Xunit;

namespace Commtrac.Api.Tests;

public class DatabaseConnectionStringResolverTests
{
    private static IConfiguration BuildConfig(Dictionary<string, string?> values)
        => new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    // ── A. Legacy fallback ──────────────────────────────────────────────

    [Fact]
    public void Legacy_connection_string_is_used_unchanged_when_Database_Host_is_absent()
    {
        var config = BuildConfig(new()
        {
            ["ConnectionStrings:DefaultConnection"] = "Host=YOUR_STAGING_RDS_HOST;Database=commtrac;Username=commtrac;Password=SET_VIA_SECRET",
        });
        var env = new TestHostEnvironment("Production");

        var result = DatabaseConnectionStringResolver.Resolve(config, env);

        Assert.Equal("Host=YOUR_STAGING_RDS_HOST;Database=commtrac;Username=commtrac;Password=SET_VIA_SECRET", result);
    }

    [Fact]
    public void Throws_when_neither_Database_Host_nor_legacy_connection_string_is_configured()
    {
        var config = BuildConfig(new());
        var env = new TestHostEnvironment("Production");

        var ex = Assert.Throws<InvalidOperationException>(() => DatabaseConnectionStringResolver.Resolve(config, env));

        Assert.Contains("Database:Host", ex.Message);
        Assert.Contains("DefaultConnection", ex.Message);
    }

    // ── B/D/E. Split configuration builds a valid Npgsql connection string ──

    [Fact]
    public void Split_configuration_builds_a_valid_connection_string_with_default_port()
    {
        var config = BuildConfig(new()
        {
            ["Database:Host"] = "strata-ngo-prod.ctk6wce0yhak.ap-southeast-2.rds.amazonaws.com",
            ["Database:Name"] = "strata_ngo",
            ["Database:Username"] = "postgres",
            ["Database:Password"] = "correct-horse-battery-staple",
        });
        var env = new TestHostEnvironment("Production");

        var result = DatabaseConnectionStringResolver.Resolve(config, env);

        // Parsed back through NpgsqlConnectionStringBuilder rather than asserting on the raw
        // string, so this test doesn't depend on Npgsql's internal formatting/ordering.
        var parsed = new NpgsqlConnectionStringBuilder(result);
        Assert.Equal("strata-ngo-prod.ctk6wce0yhak.ap-southeast-2.rds.amazonaws.com", parsed.Host);
        Assert.Equal(5432, parsed.Port);
        Assert.Equal("strata_ngo", parsed.Database);
        Assert.Equal("postgres", parsed.Username);
        Assert.Equal("correct-horse-battery-staple", parsed.Password);
    }

    [Fact]
    public void Explicit_port_is_respected()
    {
        var config = BuildConfig(new()
        {
            ["Database:Host"] = "db.example.com",
            ["Database:Port"] = "6543",
            ["Database:Name"] = "commtrac",
            ["Database:Username"] = "commtrac",
            ["Database:Password"] = "pw",
        });
        var env = new TestHostEnvironment("Production");

        var result = DatabaseConnectionStringResolver.Resolve(config, env);

        var parsed = new NpgsqlConnectionStringBuilder(result);
        Assert.Equal(6543, parsed.Port);
    }

    [Fact]
    public void Non_numeric_port_throws_without_exposing_configuration_values()
    {
        var config = BuildConfig(new()
        {
            ["Database:Host"] = "db.example.com",
            ["Database:Port"] = "not-a-number",
            ["Database:Name"] = "commtrac",
            ["Database:Username"] = "commtrac",
            ["Database:Password"] = "pw",
        });
        var env = new TestHostEnvironment("Production");

        var ex = Assert.Throws<InvalidOperationException>(() => DatabaseConnectionStringResolver.Resolve(config, env));

        Assert.Contains("Database:Port", ex.Message);
    }

    // ── C. Special characters in the password are handled safely, not concatenated ──

    [Theory]
    [InlineData("pass;word=with'special\"chars")]
    [InlineData("semi;colon")]
    [InlineData("equals=sign")]
    [InlineData("quote'mark")]
    [InlineData("double\"quote")]
    public void Password_with_connection_string_special_characters_round_trips_correctly(string password)
    {
        var config = BuildConfig(new()
        {
            ["Database:Host"] = "db.example.com",
            ["Database:Name"] = "commtrac",
            ["Database:Username"] = "commtrac",
            ["Database:Password"] = password,
        });
        var env = new TestHostEnvironment("Production");

        var result = DatabaseConnectionStringResolver.Resolve(config, env);

        // If this were built by manual string concatenation, a ';' or '=' in the password
        // would corrupt the connection string and this round-trip would fail or silently
        // parse into the wrong field. NpgsqlConnectionStringBuilder guarantees correct escaping.
        var parsed = new NpgsqlConnectionStringBuilder(result);
        Assert.Equal(password, parsed.Password);
        Assert.Equal("db.example.com", parsed.Host);
        Assert.Equal("commtrac", parsed.Database);
        Assert.Equal("commtrac", parsed.Username);
    }

    // ── F/G/H. Missing required split-config fields fail fast outside Development ──

    [Fact]
    public void Missing_Database_Name_fails_when_split_configuration_is_active()
    {
        var config = BuildConfig(new()
        {
            ["Database:Host"] = "db.example.com",
            ["Database:Username"] = "commtrac",
            ["Database:Password"] = "pw",
        });
        var env = new TestHostEnvironment("Production");

        var ex = Assert.Throws<InvalidOperationException>(() => DatabaseConnectionStringResolver.Resolve(config, env));

        Assert.Contains("Database:Name", ex.Message);
    }

    [Fact]
    public void Missing_Database_Username_fails_when_split_configuration_is_active()
    {
        var config = BuildConfig(new()
        {
            ["Database:Host"] = "db.example.com",
            ["Database:Name"] = "commtrac",
            ["Database:Password"] = "pw",
        });
        var env = new TestHostEnvironment("Production");

        var ex = Assert.Throws<InvalidOperationException>(() => DatabaseConnectionStringResolver.Resolve(config, env));

        Assert.Contains("Database:Username", ex.Message);
    }

    [Fact]
    public void Missing_Database_Password_fails_outside_Development()
    {
        var config = BuildConfig(new()
        {
            ["Database:Host"] = "db.example.com",
            ["Database:Name"] = "commtrac",
            ["Database:Username"] = "commtrac",
        });
        var env = new TestHostEnvironment("Production");

        var ex = Assert.Throws<InvalidOperationException>(() => DatabaseConnectionStringResolver.Resolve(config, env));

        Assert.Contains("Database:Password", ex.Message);
    }

    [Fact]
    public void Missing_Database_Password_fails_in_Staging_too_not_just_Production()
    {
        var config = BuildConfig(new()
        {
            ["Database:Host"] = "db.example.com",
            ["Database:Name"] = "commtrac",
            ["Database:Username"] = "commtrac",
        });
        var env = new TestHostEnvironment("Staging");

        Assert.Throws<InvalidOperationException>(() => DatabaseConnectionStringResolver.Resolve(config, env));
    }

    [Fact]
    public void Missing_Database_Password_does_not_throw_in_Development()
    {
        var config = BuildConfig(new()
        {
            ["Database:Host"] = "db.example.com",
            ["Database:Name"] = "commtrac",
            ["Database:Username"] = "commtrac",
        });
        var env = new TestHostEnvironment("Development");

        var result = DatabaseConnectionStringResolver.Resolve(config, env);

        // Development leniency mirrors JwtKeyResolver — it doesn't hard-block an incomplete
        // opted-in local split-config setup. It does not fabricate a real password either
        // (NpgsqlConnectionStringBuilder normalizes an empty Password back to null).
        var parsed = new NpgsqlConnectionStringBuilder(result);
        Assert.True(string.IsNullOrEmpty(parsed.Password));
    }

    // ── I. Partial split configuration must NOT silently fall back to the legacy string ──

    [Fact]
    public void Partial_split_configuration_does_not_fall_back_to_legacy_connection_string()
    {
        const string legacyWithStalePassword = "Host=old-host;Database=old-db;Username=old-user;Password=STALE_DUPLICATED_PASSWORD";
        var config = BuildConfig(new()
        {
            // Host is set (split config engaged) but Password is missing — this is exactly
            // the "partially migrated environment" scenario the resolver must never paper
            // over by quietly reusing the legacy string, which could hold a stale password.
            ["Database:Host"] = "new-rds-host",
            ["Database:Name"] = "commtrac",
            ["Database:Username"] = "commtrac",
            ["ConnectionStrings:DefaultConnection"] = legacyWithStalePassword,
        });
        var env = new TestHostEnvironment("Production");

        var ex = Assert.Throws<InvalidOperationException>(() => DatabaseConnectionStringResolver.Resolve(config, env));

        Assert.DoesNotContain("STALE_DUPLICATED_PASSWORD", ex.Message);
        Assert.DoesNotContain("old-host", ex.Message);
    }

    // ── J. No secret values ever appear in a thrown message ─────────────

    [Fact]
    public void Validation_exceptions_never_contain_the_configured_password_value()
    {
        var config = BuildConfig(new()
        {
            ["Database:Host"] = "db.example.com",
            ["Database:Name"] = "commtrac",
            ["Database:Username"] = "commtrac",
            ["Database:Port"] = "not-a-number",
            ["Database:Password"] = "super-secret-value-should-never-leak",
        });
        var env = new TestHostEnvironment("Production");

        var ex = Assert.Throws<InvalidOperationException>(() => DatabaseConnectionStringResolver.Resolve(config, env));

        Assert.DoesNotContain("super-secret-value-should-never-leak", ex.Message);
    }

    [Fact]
    public void Validation_exceptions_never_contain_a_full_connection_string()
    {
        var config = BuildConfig(new()
        {
            ["Database:Host"] = "db.example.com",
            ["Database:Username"] = "commtrac",
            ["Database:Password"] = "pw",
        });
        var env = new TestHostEnvironment("Production");

        var ex = Assert.Throws<InvalidOperationException>(() => DatabaseConnectionStringResolver.Resolve(config, env));

        Assert.DoesNotContain("Host=", ex.Message);
        Assert.DoesNotContain("Password=", ex.Message);
    }

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "Commtrac.Api.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
