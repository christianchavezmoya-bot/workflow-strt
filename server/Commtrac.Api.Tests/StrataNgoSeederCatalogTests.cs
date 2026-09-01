using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace Commtrac.Api.Tests;

public class StrataNgoSeederCatalogTests
{
    [Fact]
    public void SeedFreshDatabase_creates_three_products_and_ha_coal_features()
    {
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;

        using var db = new AppDbContext(options);
        db.Database.OpenConnection();
        db.Database.EnsureCreated();

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

        var products = db.Products.OrderBy(p => p.Name).Select(p => new { p.Id, p.Name, p.DivisionId }).ToList();
        Assert.Equal(3, products.Count);
        Assert.Contains(products, p => p.Name == "AIM-100" && p.DivisionId == DefaultCatalog.DivisionAiId);
        Assert.Contains(products, p => p.Name == "HA-Coal" && p.DivisionId == StrataNgoSeeder.DivisionHazardAvertCoalId);
        Assert.Contains(products, p => p.Name == "Chambers" && p.DivisionId == DefaultCatalog.DivisionProtectId);

        var haCoalFeatureCount = db.ProductFeatures.Count(pf => pf.ProductId == StrataNgoSeeder.ProductHaCoalId);
        Assert.Equal(8, haCoalFeatureCount);

        var workflow = db.WorkflowConfigs.Single(w => w.Id == StrataNgoSeeder.WorkflowChambersDefaultId);
        Assert.Equal(StrataNgoSeeder.ProductChambersId, workflow.ProductId);
        Assert.Equal("Published", workflow.Status);
    }
}
