using System.Text.Json;
using BCrypt.Net;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Data;

public static class DbInitializer
{
    public static void Initialize(AppDbContext db, IConfiguration config)
    {
        // Fix partially-applied Add2faFields migration:
        // The 2FA columns may already exist from a failed run, but the migration
        // wasn't recorded. Detect this and mark it as applied before running migrations.
        FixPartialMigration(db);

        db.Database.Migrate();
        EnsureAuditLogTable(db);
        EnsureSessionsTable(db);
        EnsurePasswordChangedAtColumn(db);
        EnsureLinkableKeyFieldDefinitions(db);

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

        // Customer seed data is now handled by migrations (SeedDemoCustomerAndSite)
        // Removed default customers to avoid conflicts

        SeedProducts(db);
        db.SaveChanges(); // flush products before feature patch so LINQ queries can find them

        EnsureAim100Features(db);

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

        if (!db.NotificationSettings.Any())
        {
            // Seed a single row so admin can edit notification settings from the UI.
            // Real values can also come from appsettings/env vars until configured.
            db.NotificationSettings.Add(new NotificationSettingsEntity
            {
                Id = 1,
                SmtpHost = "",
                SmtpPort = 25,
                SmtpUseSsl = false,
                SmtpUser = "",
                SmtpPass = "",
                SmtpFrom = config["Email:FromAddress"] ?? "no-reply@commtrac.local",
                FrontendBaseUrl = config["Email:FrontendBaseUrl"] ?? "",
                SmsProvider = config["Sms:Provider"] ?? "",
                SmsApiKey = config["Sms:ApiKey"] ?? "",
                SmsSender = config["Sms:Sender"] ?? ""
            });
        }

        db.SaveChanges();
    }

    // TableConfigDialog only allows linking to fields that are typed as "primary key"/"composite key"/"lookup field".
    // Seed lightweight PK definitions for Customers/Sites so "Link to" can target those tables.
    private static void EnsureLinkableKeyFieldDefinitions(AppDbContext db)
    {
        if (!db.FieldDefinitions.Any(f => f.Id == "field-customer-key"))
        {
            db.FieldDefinitions.Add(new FieldDefinitionEntity
            {
                Id = "field-customer-key",
                Name = "Customer Key",
                FieldType = "primary key",
                LinkToFieldId = null,
                ActionType = null,
                TablesJson = JsonSerializer.Serialize(new[] { "customers" }),
                SortOrder = 46,
                IsActive = true
            });
        }

        if (!db.FieldDefinitions.Any(f => f.Id == "field-site-key"))
        {
            db.FieldDefinitions.Add(new FieldDefinitionEntity
            {
                Id = "field-site-key",
                Name = "Site Key",
                FieldType = "primary key",
                LinkToFieldId = null,
                ActionType = null,
                TablesJson = JsonSerializer.Serialize(new[] { "sites" }),
                SortOrder = 47,
                IsActive = true
            });
        }
    }

    /// <summary>
    /// Creates the AuditLogs table if it doesn't exist (no migration needed).
    /// </summary>
    private static void EnsureAuditLogTable(AppDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                CREATE TABLE IF NOT EXISTS AuditLogs (
                    Id TEXT PRIMARY KEY NOT NULL,
                    UserId TEXT NOT NULL DEFAULT '',
                    UserEmail TEXT NOT NULL DEFAULT '',
                    Action TEXT NOT NULL DEFAULT '',
                    Details TEXT,
                    IpAddress TEXT,
                    Timestamp TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
                )";
            cmd.ExecuteNonQuery();

            cmd.CommandText = "CREATE INDEX IF NOT EXISTS IX_AuditLogs_UserId ON AuditLogs (UserId)";
            cmd.ExecuteNonQuery();

            cmd.CommandText = "CREATE INDEX IF NOT EXISTS IX_AuditLogs_Timestamp ON AuditLogs (Timestamp)";
            cmd.ExecuteNonQuery();
        }
        finally
        {
            conn.Close();
        }
    }

    private static void EnsureSessionsTable(AppDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                CREATE TABLE IF NOT EXISTS Sessions (
                    Id TEXT PRIMARY KEY NOT NULL,
                    UserId TEXT NOT NULL DEFAULT '',
                    UserEmail TEXT NOT NULL DEFAULT '',
                    IpAddress TEXT,
                    UserAgent TEXT,
                    CreatedAt TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    LastActiveAt TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    IsRevoked INTEGER NOT NULL DEFAULT 0
                )";
            cmd.ExecuteNonQuery();

            cmd.CommandText = "CREATE INDEX IF NOT EXISTS IX_Sessions_UserId ON Sessions (UserId)";
            cmd.ExecuteNonQuery();
        }
        finally
        {
            conn.Close();
        }
    }

    private static void EnsurePasswordChangedAtColumn(AppDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Users') WHERE name='PasswordChangedAt'";
            var exists = Convert.ToInt64(cmd.ExecuteScalar()) > 0;
            if (!exists)
            {
                cmd.CommandText = "ALTER TABLE Users ADD COLUMN PasswordChangedAt TEXT";
                cmd.ExecuteNonQuery();
            }
        }
        finally
        {
            conn.Close();
        }
    }

    // -----------------------------------------------------------------------
    // Product seeding
    // -----------------------------------------------------------------------

    // All known products. Add new products here — they will be inserted on
    // first startup if the name doesn't already exist in the database.
    private static readonly (string Name, string? Description)[] KnownProducts =
    [
        ("AIM-100",               "AIM-100 field device"),
        ("Commtrac",              "Commtrac core platform"),
        ("EDGE AI",               "EDGE AI processing module"),
        ("Hazard Avert",          "Hazard detection and avoidance"),
        ("Hazard Avert - Gen 2",  "Hazard Avert second generation"),
        ("Ping Alert",            "Personnel alerting system"),
        ("New Ice Cream",         null),
        ("Coffee",                null),
    ];

    private static void SeedProducts(AppDbContext db)
    {
        var existingNames = db.Products.Select(p => p.Name).ToHashSet();
        foreach (var (name, desc) in KnownProducts)
        {
            if (!existingNames.Contains(name))
                db.Products.Add(new ProductEntity { Name = name, Description = desc });
        }
    }

    // AIM-100 feature definitions reconstructed from the AIM-100 Workflow StepsJson.
    // The IDs are kept identical so existing workflow step featureId references stay intact.
    private const string Aim100FeaturesJson =
        """[{"id":"088aa75d-fd13-4d99-bf18-07c4c95c21c9","name":"Front Camera","valueType":"single-select","options":["Yes","No","N/A"],"quantity":0,"subProperties":null},""" +
        """{"id":"5b2f3511-9a13-4fb3-86f1-1b30d132bce6","name":"Router","valueType":"single-select","options":["Yes","No","N/A"],"quantity":0,"subProperties":null},""" +
        """{"id":"b3eef625-8bf1-4488-8af8-0699bd0e9ad9","name":"Wi-Fi Antenna","valueType":"single-select","options":["Yes","No","N/A"],"quantity":0,"subProperties":null},""" +
        """{"id":"c6b4b1d8-4b03-44c6-9225-779850febcde","name":"IP","valueType":"text","options":[],"quantity":0,"subProperties":null},""" +
        """{"id":"7b267e0a-9c42-4b3d-8aa9-4cea574cf57e","name":"CAN BUS","valueType":"single-select","options":["Yes","No","N/A"],"quantity":0,"subProperties":null},""" +
        """{"id":"87e9f6ad-b0f8-4cd4-ae8f-4c816932f57d","name":"Park Brake Signal","valueType":"single-select","options":["Yes","No","N/A"],"quantity":0,"subProperties":null},""" +
        """{"id":"d8369777-e271-4f21-ba83-4512be0347d1","name":"Reverse Signal","valueType":"single-select","options":["Yes","No","N/A"],"quantity":0,"subProperties":null},""" +
        """{"id":"2f579496-94d3-4bd3-b834-0934653a4fd4","name":"AIM-100","valueType":"component","options":[],"quantity":0,"subProperties":[""" +
            """{"id":"404335f9-7aa8-4eae-9a38-eb97617b76e6","name":"Part Number","valueType":"text"},""" +
            """{"id":"9e9efc4a-ad1c-4263-827e-2bd2d620ff48","name":"Serial Number","valueType":"text"},""" +
            """{"id":"af17eb48-4286-4cbb-b567-c7bc87880301","name":"IP","valueType":"text"},""" +
            """{"id":"92366f8e-1561-4dc3-915f-b597037d5d82","name":"Firmware","valueType":"text"}]}]""";

    /// <summary>
    /// Restores AIM-100 feature definitions if they are missing (FeaturesJson == "[]").
    /// Only patches the row when empty so any UI edits to features are never overwritten.
    /// </summary>
    private static void EnsureAim100Features(AppDbContext db)
    {
        var aim100 = db.Products.FirstOrDefault(p => p.Name == "AIM-100");
        if (aim100 is null || aim100.FeaturesJson != "[]") return;
        aim100.FeaturesJson = Aim100FeaturesJson;
    }

    /// <summary>
    /// Handles the case where the Add2faFields migration was partially applied
    /// (columns added to Users table but migration not recorded in history).
    /// Detects this state and inserts the history record so Migrate() skips it.
    /// </summary>
    private static void FixPartialMigration(AppDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            using var cmd = conn.CreateCommand();

            // Check if the 2FA column exists on the Users table
            cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Users') WHERE name='Is2faEnabled'";
            var colExists = Convert.ToInt64(cmd.ExecuteScalar()) > 0;

            if (!colExists) return; // Fresh DB or columns not yet added — let Migrate() handle it

            // Check if the migration is already recorded
            cmd.CommandText = "SELECT COUNT(*) FROM __EFMigrationsHistory WHERE MigrationId='20260212035001_Add2faFields'";
            var migRecorded = Convert.ToInt64(cmd.ExecuteScalar()) > 0;

            if (!migRecorded)
            {
                // Columns exist but migration not recorded — fix it
                cmd.CommandText = "INSERT INTO __EFMigrationsHistory (MigrationId, ProductVersion) VALUES ('20260212035001_Add2faFields', '8.0.23')";
                cmd.ExecuteNonQuery();
            }
        }
        finally
        {
            conn.Close();
        }
    }
}
