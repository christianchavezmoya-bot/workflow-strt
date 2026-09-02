using System.Text.Json;
using BCrypt.Net;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Data;

/// <summary>
/// Clean demo catalog for Strata N-Go Docker staging (Postgres fresh volume).
/// Activated when SeedProfile=StrataNgo on first boot (!Users.Any()).
/// </summary>
public static class StrataNgoSeeder
{
    public const string ProfileName = "StrataNgo";

    // Stable ids for reproducible staging resets.
    public const string OfficeNewcastleId = "office-strata-newcastle";
    public const string OfficePerthId = "office-strata-perth";
    public const string CustomerBhpId = "cust-bhp-mining";
    public const string CustomerSecondId = "cust-strata-demo-mining";
    public const string DivisionHazardAvertCoalId = "div-hazard-avert-coal";
    public const string ProductAim100Id = "prod-aim-100";
    public const string ProductHaCoalId = "prod-ha-coal";
    public const string ProductChambersId = "prod-chambers";
    public const string WorkflowChambersDefaultId = "wf-chambers-default";

    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public static bool IsEnabled(IConfiguration config) =>
        string.Equals(config["SeedProfile"], ProfileName, StringComparison.OrdinalIgnoreCase);

    public static void SeedFreshDatabase(AppDbContext db, IConfiguration config)
    {
        RemoveDemoMigrationData(db);
        RemoveDefaultCatalog(db);
        SeedUsers(db, config);
        SeedOffices(db);
        SeedCustomers(db);
        SeedDivisions(db);
        SeedProducts(db);
        SeedHaCoalFeatures(db);
        SeedChambersWorkflow(db);
        SeedBrand(db);
    }

    private static void RemoveDemoMigrationData(AppDbContext db)
    {
        var demoSites = db.Sites.Where(s => s.CustomerId == "demo-customer-001");
        db.Sites.RemoveRange(demoSites);
        var demoCustomer = db.Customers.FirstOrDefault(c => c.Id == "demo-customer-001");
        if (demoCustomer != null) db.Customers.Remove(demoCustomer);
    }

    private static void RemoveDefaultCatalog(AppDbContext db)
    {
        db.Products.RemoveRange(db.Products.ToList());
        db.Divisions.RemoveRange(db.Divisions.ToList());
        db.SaveChanges(); // flush before the division seed checks whether any remain
    }

    private static void SeedUsers(AppDbContext db, IConfiguration config)
    {
        var adminEmail = config["SeedAdmin:Email"] ?? "admin.dev@stratango.local";
        var adminPassword = DbInitializer.ResolveSeedAdminPassword(config);
        var adminFullName = config["SeedAdmin:FullName"] ?? "Strata Admin";
        var pmEmail = config["SeedProjectManager:Email"] ?? "projectmanager.dev@stratango.local";
        var pmPassword = DbInitializer.ResolveSeedProjectManagerPassword(config);
        var pmFullName = config["SeedProjectManager:FullName"] ?? "Project Manager";

        db.Users.Add(new UserEntity
        {
            Email = adminEmail,
            FullName = adminFullName,
            Role = "Admin",
            Office = "Australia",
            IsActive = true,
            IsFirstLogin = true,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminPassword),
        });

        db.Users.Add(new UserEntity
        {
            Email = pmEmail,
            FullName = pmFullName,
            Role = "Project Manager",
            Office = "Australia",
            IsActive = true,
            IsFirstLogin = true,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(pmPassword),
        });
    }

    private static void SeedOffices(AppDbContext db)
    {
        db.Offices.Add(new OfficeEntity
        {
            Id = OfficeNewcastleId,
            Country = "Australia",
            State = "New South Wales",
            City = "Newcastle",
            Lat = -32.9272881,
            Lng = 151.7812534,
        });

        db.Offices.Add(new OfficeEntity
        {
            Id = OfficePerthId,
            Country = "Australia",
            State = "Western Australia",
            City = "Perth",
            Lat = -31.9505,
            Lng = 115.8605,
        });
    }

    private static void SeedCustomers(AppDbContext db)
    {
        db.Customers.Add(new CustomerEntity
        {
            Id = CustomerBhpId,
            Name = "BHP/Mining",
            CustomerId = "BHP-001",
            Office = "Australia",
            Industry = "Mining",
        });

        db.Customers.Add(new CustomerEntity
        {
            Id = CustomerSecondId,
            Name = "Strata Demo Mining",
            CustomerId = "STR-001",
            Office = "Australia",
            Industry = "Mining",
        });
    }

    private static void SeedDivisions(AppDbContext db)
    {
        DefaultCatalog.SeedDivisionsIfEmpty(db);
        if (db.Divisions.Any(d => d.Id == DivisionHazardAvertCoalId)) return;

        db.Divisions.Add(new DivisionEntity
        {
            Id = DivisionHazardAvertCoalId,
            Name = "HazardAvert-Coal",
            Description = "HazardAvert coal applications",
            SortOrder = 4,
            IsActive = true,
        });
    }

    private static void SeedProducts(AppDbContext db)
    {
        db.Products.Add(new ProductEntity
        {
            Id = ProductAim100Id,
            Name = "AIM-100",
            DivisionId = DefaultCatalog.DivisionAiId,
            Description = "AI Proximity Detection",
            FeaturesJson = "[]",
        });

        db.Products.Add(new ProductEntity
        {
            Id = ProductHaCoalId,
            Name = "HA-Coal",
            DivisionId = DivisionHazardAvertCoalId,
            Description = "HazardAvert coal proximity system",
            FeaturesJson = "[]",
        });

        db.Products.Add(new ProductEntity
        {
            Id = ProductChambersId,
            Name = "Chambers",
            DivisionId = DefaultCatalog.DivisionProtectId,
            Description = "Underground refuge chamber",
            FeaturesJson = "[]",
        });
    }

    private static void SeedHaCoalFeatures(AppDbContext db)
    {
        var seedPath = Path.Combine(AppContext.BaseDirectory, "SeedData", "ha-coal-features.json");
        if (!File.Exists(seedPath))
        {
            Console.WriteLine($"[StrataNgoSeeder] WARN: HA-Coal features seed file missing: {seedPath}");
            return;
        }

        var rows = JsonSerializer.Deserialize<List<HaCoalFeatureSeed>>(File.ReadAllText(seedPath), JsonOpts)
                   ?? new List<HaCoalFeatureSeed>();

        var sortOrder = 0;
        foreach (var row in rows.Where(r => !string.IsNullOrWhiteSpace(r.Id) && !string.IsNullOrWhiteSpace(r.Name)))
        {
            db.Features.Add(new FeatureEntity
            {
                Id = row.Id,
                Name = row.Name.Trim(),
                Description = string.IsNullOrWhiteSpace(row.Description) ? row.Name.Trim() : row.Description.Trim(),
                ValueType = "text",
                OptionsJson = "[]",
                SubPropertiesJson = "[]",
                IsInventory = row.IsInventory,
                CaptureFieldsJson = JsonSerializer.Serialize(row.CaptureFields ?? ["serialNo"], JsonOpts),
                Brand = row.Brand,
                Supplier = row.Supplier,
                ManufacturerPartNumber = row.ManufacturerPartNumber,
                AlternativePartNumber = row.AlternativePartNumber,
            });

            db.ProductFeatures.Add(new ProductFeatureEntity
            {
                ProductId = ProductHaCoalId,
                FeatureId = row.Id,
                SortOrder = sortOrder++,
            });
        }
    }

    private static void SeedChambersWorkflow(AppDbContext db)
    {
        if (db.WorkflowConfigs.Any(c => c.Id == WorkflowChambersDefaultId)) return;

        var seedPath = Path.Combine(AppContext.BaseDirectory, "SeedData", "chambers-default-workflow.json");
        if (!File.Exists(seedPath))
        {
            Console.WriteLine($"[StrataNgoSeeder] WARN: workflow seed file missing: {seedPath}");
            return;
        }

        using var doc = JsonDocument.Parse(File.ReadAllText(seedPath));
        var root = doc.RootElement;
        var stepsJson = root.TryGetProperty("stepsJson", out var stepsEl) ? stepsEl.GetString() ?? "[]" : "[]";
        const string legacyChambersProductId = "323c7777-7af1-49ec-96f4-8b1d4fb7aa5a";
        stepsJson = stepsJson
            .Replace(legacyChambersProductId, ProductChambersId, StringComparison.Ordinal)
            .Replace(ProductAim100Id, ProductChambersId, StringComparison.Ordinal);

        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = WorkflowChambersDefaultId,
            ProductId = ProductChambersId,
            Name = "Chambers_default",
            DisplayName = "Chambers 10 steps",
            ConfigType = root.TryGetProperty("configType", out var ct) ? ct.GetString() : "Inspection",
            WorkflowTypeId = root.TryGetProperty("workflowTypeId", out var wt) ? wt.GetString() : "wftype-inspection",
            Status = "Published",
            Version = 1,
            StepsJson = stepsJson,
            MediaJson = root.TryGetProperty("mediaJson", out var mj) ? mj.GetString() ?? "[]" : "[]",
            FeatureSelectionsJson = root.TryGetProperty("featureSelectionsJson", out var fj) ? fj.GetString() ?? "[]" : "[]",
            CreatedBy = "admin.dev@stratango.local",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
    }

    private static void SeedBrand(AppDbContext db)
    {
        if (!db.BrandSettings.Any(s => s.Key == "app-name"))
        {
            db.BrandSettings.Add(new BrandSettingEntity
            {
                Key = "app-name",
                Value = "Strata N-Go",
            });
        }
    }

    private sealed class HaCoalFeatureSeed
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string? Description { get; set; }
        public string? Brand { get; set; }
        public string? Supplier { get; set; }
        public string? ManufacturerPartNumber { get; set; }
        public string? AlternativePartNumber { get; set; }
        public bool IsInventory { get; set; } = true;
        public List<string>? CaptureFields { get; set; }
    }
}
