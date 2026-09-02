using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Verifies the seeded Admin/Project Manager/Installer login identities produced by the
/// StrataNgo and Minimal seed profiles, both with no config override (the
/// *.dev@stratango.local defaults) and with the explicit config production/staging
/// appsettings supply. The no-SeedProfile fallback path in DbInitializer.Initialize is
/// covered indirectly by the existing HTTP-login integration tests (AuthLoginTests etc.),
/// which log in against ApiTestFactory's database using the fallback-seeded admin.
/// </summary>
public class SeededIdentityTests
{
    private static AppDbContext OpenInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;
        var db = new AppDbContext(options);
        db.Database.OpenConnection();
        db.Database.EnsureCreated();
        return db;
    }

    [Fact]
    public void StrataNgoSeeder_uses_dev_defaults_when_not_configured()
    {
        using var db = OpenInMemoryDb();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["SeedProfile"] = StrataNgoSeeder.ProfileName,
                ["SeedAdmin:Password"] = "Admin123!",
                ["SeedProjectManager:Password"] = "Pm123!",
            })
            .Build();

        StrataNgoSeeder.SeedFreshDatabase(db, config);
        db.SaveChanges();

        var admin = db.Users.Single(u => u.Role == "Admin");
        var pm = db.Users.Single(u => u.Role == "Project Manager");
        Assert.Equal("admin.dev@stratango.local", admin.Email);
        Assert.Equal("projectmanager.dev@stratango.local", pm.Email);
    }

    [Fact]
    public void StrataNgoSeeder_uses_configured_production_identities_when_set()
    {
        using var db = OpenInMemoryDb();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["SeedProfile"] = StrataNgoSeeder.ProfileName,
                ["SeedAdmin:Email"] = "admin@stratango.local",
                ["SeedAdmin:Password"] = "Admin123!",
                ["SeedProjectManager:Email"] = "projectmanager@stratango.local",
                ["SeedProjectManager:Password"] = "Pm123!",
            })
            .Build();

        StrataNgoSeeder.SeedFreshDatabase(db, config);
        db.SaveChanges();

        var admin = db.Users.Single(u => u.Role == "Admin");
        var pm = db.Users.Single(u => u.Role == "Project Manager");
        Assert.Equal("admin@stratango.local", admin.Email);
        Assert.Equal("projectmanager@stratango.local", pm.Email);
    }

    [Fact]
    public void MinimalSeeder_uses_dev_defaults_when_not_configured()
    {
        using var db = OpenInMemoryDb();
        var config = new ConfigurationBuilder().Build();

        MinimalSeeder.SeedFreshDatabase(db, config);
        db.SaveChanges();

        var admin = db.Users.Single(u => u.Role == "Admin");
        var installer = db.Users.Single(u => u.Role == "Installer");
        Assert.Equal("admin.dev@stratango.local", admin.Email);
        Assert.Equal("installer.dev@stratango.local", installer.Email);
    }

    [Fact]
    public void No_active_seed_path_produces_a_commtrac_local_identity()
    {
        using var dbMinimal = OpenInMemoryDb();
        MinimalSeeder.SeedFreshDatabase(dbMinimal, new ConfigurationBuilder().Build());
        Assert.DoesNotContain(dbMinimal.Users, u => u.Email.Contains("commtrac.local"));

        using var dbStrataNgo = OpenInMemoryDb();
        StrataNgoSeeder.SeedFreshDatabase(dbStrataNgo, new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["SeedProfile"] = StrataNgoSeeder.ProfileName,
                ["SeedAdmin:Password"] = "Admin123!",
                ["SeedProjectManager:Password"] = "Pm123!",
            })
            .Build());
        Assert.DoesNotContain(dbStrataNgo.Users, u => u.Email.Contains("commtrac.local"));
    }
}
