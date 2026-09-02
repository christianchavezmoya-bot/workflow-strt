using BCrypt.Net;
using Commtrac.Api.Models;

namespace Commtrac.Api.Data;

/// <summary>
/// Empty catalog for clean field testing: admin + installer only, no projects/assets/workflows.
/// Activated when SeedProfile=Minimal on first boot (!Users.Any()).
/// Delete commtrac.db (or Postgres volume) and restart with SeedProfile=Minimal to reset.
/// </summary>
public static class MinimalSeeder
{
    public const string ProfileName = "Minimal";

    public static bool IsEnabled(IConfiguration config) =>
        string.Equals(config["SeedProfile"], ProfileName, StringComparison.OrdinalIgnoreCase);

    public static void SeedFreshDatabase(AppDbContext db, IConfiguration config)
    {
        var adminEmail = config["SeedAdmin:Email"] ?? "admin.dev@stratango.local";
        var adminPassword = config["SeedAdmin:Password"] ?? "Admin123!";
        var adminFullName = config["SeedAdmin:FullName"] ?? "System Admin";
        var installerEmail = config["SeedInstaller:Email"] ?? "installer.dev@stratango.local";
        var installerPassword = config["SeedInstaller:Password"] ?? "Installer123!";
        var installerFullName = config["SeedInstaller:FullName"] ?? "Field Installer";

        db.Users.Add(new UserEntity
        {
            Email = adminEmail,
            FullName = adminFullName,
            Role = "Admin",
            Office = "Australia",
            IsActive = true,
            IsFirstLogin = false,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminPassword),
        });

        db.Users.Add(new UserEntity
        {
            Email = installerEmail,
            FullName = installerFullName,
            Role = "Installer",
            Office = "Australia",
            IsActive = true,
            IsFirstLogin = false,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(installerPassword),
        });

        db.Offices.Add(new OfficeEntity
        {
            Id = "office-australia",
            Country = "Australia",
            State = "New South Wales",
            City = "Newcastle",
            Lat = -32.9272881,
            Lng = 151.7812534,
        });

        DefaultCatalog.SeedDivisionsIfEmpty(db);
    }

    /// <summary>
    /// Runs on every Minimal boot, not just a fresh one: a database that was wiped and then
    /// restarted without SeedProfile=Minimal picks up the demo project and demo catalog, and
    /// restarting with the profile should clear it again. Only rows matching the seeded demo
    /// data are touched, and the catalog is left alone once any real work exists.
    /// Notification/SMTP settings are never touched.
    /// </summary>
    public static void EnsureCleanCatalog(AppDbContext db)
    {
        db.SaveChanges(); // flush any fresh-seed rows so the queries below see the real state

        var demoProjects = db.Projects
            .Where(p => p.JobNumber == DefaultCatalog.DemoJobNumber && p.CustomerId == DefaultCatalog.DemoCustomerId)
            .ToList();

        var demoProjectIds = demoProjects.Select(p => p.Id).ToHashSet();
        var realProjectIds = db.Projects.Select(p => p.Id).ToHashSet();

        // Older builds seeded the demo installation before the project was saved, so its
        // ProjectId can be the orphan placeholder rather than the demo project's id.
        var demoInstallations = db.Installations
            .Where(i => i.InstallationNumber == DefaultCatalog.DemoInstallationNumber
                     && i.SiteLocation == DefaultCatalog.DemoInstallationSite
                     && i.AssignedTeam == DefaultCatalog.DemoInstallationTeam)
            .ToList()
            .Where(i => demoProjectIds.Contains(i.ProjectId) || !realProjectIds.Contains(i.ProjectId))
            .ToList();

        if (demoProjects.Count > 0 || demoInstallations.Count > 0)
        {
            db.Installations.RemoveRange(demoInstallations);
            db.Projects.RemoveRange(demoProjects);
            db.SaveChanges();
            Console.WriteLine($"[MinimalSeeder] Removed {demoProjects.Count} demo project(s) and {demoInstallations.Count} demo installation(s).");
        }

        // Divisions/products are only safe to reset while nothing references them.
        var catalogInUse = db.Projects.Any()
            || db.Installations.Any()
            || db.Assets.Any()
            || db.ProjectAssets.Any()
            || db.WorkflowConfigs.Any()
            || db.WorkflowTemplates.Any();

        if (!catalogInUse)
        {
            var demoProducts = db.Products
                .Where(p => DbInitializer.DemoProductNames.Contains(p.Name))
                .ToList();
            var demoDivisions = db.Divisions
                .Where(d => DefaultCatalog.DemoDivisionIds.Contains(d.Id))
                .ToList();

            if (demoProducts.Count > 0 || demoDivisions.Count > 0)
            {
                var demoProductIds = demoProducts.Select(p => p.Id).ToList();
                db.ProductFeatures.RemoveRange(db.ProductFeatures.Where(pf => demoProductIds.Contains(pf.ProductId)));
                db.Products.RemoveRange(demoProducts);
                db.Divisions.RemoveRange(demoDivisions);
                db.SaveChanges();
                Console.WriteLine($"[MinimalSeeder] Removed {demoProducts.Count} demo product(s) and {demoDivisions.Count} demo division(s).");
            }
        }

        DefaultCatalog.SeedDivisionsIfEmpty(db);
        db.SaveChanges();
    }
}
