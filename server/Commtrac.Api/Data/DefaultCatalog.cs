using Commtrac.Api.Models;

namespace Commtrac.Api.Data;

/// <summary>
/// The divisions a fresh database ships with, plus the identifiers of the older
/// demo catalog so clean-catalog resets can recognise (and remove) seeded rows
/// without touching anything an admin created.
/// </summary>
public static class DefaultCatalog
{
    public const string DivisionConnectId = "div-strata-connect";
    public const string DivisionProtectId = "div-strata-protect";
    public const string DivisionAiId = "div-strata-ai";

    public static readonly (string Id, string Name, string? Description, int SortOrder)[] Divisions =
    [
        (DivisionConnectId, "Strata Connect", "Connectivity and tracking platforms", 1),
        (DivisionProtectId, "Strata Protect", "Personnel and vehicle safety systems", 2),
        (DivisionAiId,      "Strata AI",      "AI and analytics products",           3),
    ];

    // Divisions of the demo catalog, kept only so the demo profile and the clean-catalog
    // reset agree on which rows were seeded rather than created by an admin.
    public const string DemoDivisionMiningId = "div-mining";
    public const string DemoDivisionSafetyId = "div-safety";
    public const string DemoDivisionTechId = "div-tech";

    public static readonly string[] DemoDivisionIds =
    [
        DemoDivisionMiningId, DemoDivisionSafetyId, DemoDivisionTechId,
    ];

    public const string DemoJobNumber = "JOB-4021";
    public const string DemoCustomerId = "CUST-1001";
    public const string DemoInstallationNumber = "INST-01";
    public const string DemoInstallationSite = "Los Angeles, CA";
    public const string DemoInstallationTeam = "Team Alpha";

    /// <summary>
    /// Seeds the default divisions only when the database has none, so renamed or
    /// deleted divisions are never resurrected on a later boot.
    /// </summary>
    public static void SeedDivisionsIfEmpty(AppDbContext db)
    {
        // Local check matters when a fresh-seed pass already queued the rows but hasn't saved yet.
        if (db.Divisions.Local.Count > 0 || db.Divisions.Any()) return;

        foreach (var (id, name, description, sortOrder) in Divisions)
        {
            db.Divisions.Add(new DivisionEntity
            {
                Id = id,
                Name = name,
                Description = description,
                SortOrder = sortOrder,
                IsActive = true,
            });
        }
    }
}
