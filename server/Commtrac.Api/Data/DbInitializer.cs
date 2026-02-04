using System.Text.Json;
using BCrypt.Net;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Data;

public static class DbInitializer
{
    public static void Initialize(AppDbContext db, IConfiguration config)
    {
        db.Database.Migrate();

        if (!db.Users.Any())
        {
            var adminEmail = config["SeedAdmin:Email"] ?? "admin@commtrac.local";
            var adminPassword = config["SeedAdmin:Password"] ?? "Admin123!";
            var adminFullName = config["SeedAdmin:FullName"] ?? "System Admin";
            var passwordHash = BCrypt.Net.BCrypt.HashPassword(adminPassword);

            db.Users.Add(new UserEntity
            {
                Email = adminEmail,
                FullName = adminFullName,
                Role = "Admin",
                Office = "USA",
                IsActive = true,
                IsFirstLogin = false,
                PasswordHash = passwordHash
            });

            db.Users.Add(new UserEntity
            {
                Email = "pm@commtrac.local",
                FullName = "Project Manager",
                Role = "Project Manager",
                Office = "USA",
                IsActive = true,
                IsFirstLogin = false,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("Pm123!")
            });
        }
        else
        {
            var adminEmail = config["SeedAdmin:Email"] ?? "admin@commtrac.local";
            var adminFullName = config["SeedAdmin:FullName"] ?? "System Admin";
            var existingAdmin = db.Users.FirstOrDefault(u => u.Email == adminEmail);
            if (existingAdmin != null && existingAdmin.FullName != adminFullName)
            {
                existingAdmin.FullName = adminFullName;
            }
        }

        if (!db.Customers.Any())
        {
            db.Customers.AddRange(
                new CustomerEntity { Name = "Strata Worldwide", CustomerId = "CUST-1001", Office = "USA" },
                new CustomerEntity { Name = "OmniBuild", CustomerId = "CUST-1002", Office = "Australia" },
                new CustomerEntity { Name = "Westline Partners", CustomerId = "CUST-1003", Office = "All" }
            );
        }

        if (!db.Products.Any())
        {
            db.Products.AddRange(
                new ProductEntity { Name = "Tracker Alpha", Description = "Core tracking suite." },
                new ProductEntity { Name = "Tracker Pro", Description = "Advanced reporting and alerts." }
            );
        }

        if (!db.Projects.Any())
        {
            var productId = db.Products.Select(p => p.Id).FirstOrDefault();
            db.Projects.Add(new ProjectEntity
            {
                CustomerName = "Strata Worldwide",
                CustomerId = "CUST-1001",
                JobNumber = "JOB-4021",
                Description = "Install core tracking suite.",
                StartDate = "2026-02-01",
                FinishDate = "2026-03-15",
                Office = "USA",
                Region = "West",
                ProjectType = "External",
                Status = "In Progress",
                ApprovalDecision = "Approved",
                IsInstallationProject = true,
                InstallationMode = "Single Installation",
                ProjectManager = "Project Manager",
                ContractValue = 250000,
                ProbabilityStage = "Signed",
                ProductIds = string.IsNullOrEmpty(productId) ? new List<string>() : new List<string> { productId }
            });
        }

        if (!db.Installations.Any())
        {
            var projectId = db.Projects.Select(p => p.Id).FirstOrDefault() ?? "P-1000";
            db.Installations.Add(new InstallationEntity
            {
                ProjectId = projectId,
                InstallationNumber = "INST-01",
                SiteLocation = "Los Angeles, CA",
                ScheduledStart = "2026-02-10",
                ScheduledEnd = "2026-02-14",
                Status = "Scheduled",
                AssignedTeam = "Team Alpha",
                AssignedUsers = new List<string>(),
                Office = "USA"
            });
        }

        if (!db.QuickbaseSettings.Any())
        {
            db.QuickbaseSettings.Add(new QuickbaseSettingsEntity
            {
                Enabled = false,
                RealmHostname = "",
                UserToken = "",
                ProjectsTableId = "",
                InstallationsTableId = "",
                ProjectsFieldMapJson = JsonSerializer.Serialize(new Dictionary<string, int>()),
                InstallationsFieldMapJson = JsonSerializer.Serialize(new Dictionary<string, int>())
            });
        }

        db.SaveChanges();
    }
}
