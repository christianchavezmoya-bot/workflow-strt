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
        var adminEmail = config["SeedAdmin:Email"] ?? "admin@commtrac.local";
        var adminPassword = config["SeedAdmin:Password"] ?? "Admin123!";
        var adminFullName = config["SeedAdmin:FullName"] ?? "System Admin";
        var installerEmail = config["SeedInstaller:Email"] ?? "installer@commtrac.local";
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
    }
}
