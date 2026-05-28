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

        // Fix migrations that were applied via Ensure* helpers before EF migration files existed.
        FixEnsuredMigrations(db);

        db.Database.Migrate();
        EnsureAuditLogTable(db);
        EnsureSessionsTable(db);
        EnsurePasswordChangedAtColumn(db);
        EnsureMobileUploadTokensTable(db);
        EnsureDocumentTables(db);
        EnsureAssetDocumentTables(db);
        EnsureAssetDocumentLinksTables(db);
        EnsureRunTimeTrackingColumns(db);
        EnsureMarch15Columns(db);
        EnsureFeatureProcurementColumns(db);
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

        CleanupSeederArtifacts(db);
        SeedDivisions(db);
        SeedProducts(db);
        db.SaveChanges(); // flush products before feature patch so LINQ queries can find them

        EnsureAim100Features(db);
        MigrateProductFeaturesToGlobalLibrary(db);
        db.SaveChanges();

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

    private static void EnsureMobileUploadTokensTable(AppDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                CREATE TABLE IF NOT EXISTS MobileUploadTokens (
                    Token           TEXT PRIMARY KEY NOT NULL,
                    Type            TEXT NOT NULL DEFAULT 'tips',
                    LinkedTo        TEXT NOT NULL DEFAULT '',
                    CustomValuesJson TEXT NULL,
                    Status          TEXT NOT NULL DEFAULT 'pending',
                    DocumentId      TEXT NULL,
                    CreatedByUserId TEXT NULL,
                    CreatedAtUtc    TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    ExpiresAtUtc    TEXT NOT NULL DEFAULT '0001-01-01T00:00:00',
                    ConsumedAtUtc   TEXT NULL
                )";
            cmd.ExecuteNonQuery();

            cmd.CommandText = "CREATE INDEX IF NOT EXISTS IX_MobileUploadTokens_Status ON MobileUploadTokens (Status)";
            cmd.ExecuteNonQuery();

            cmd.CommandText = "CREATE INDEX IF NOT EXISTS IX_MobileUploadTokens_ExpiresAtUtc ON MobileUploadTokens (ExpiresAtUtc)";
            cmd.ExecuteNonQuery();
        }
        finally
        {
            conn.Close();
        }
    }

    // -----------------------------------------------------------------------
    // Division seeding
    // -----------------------------------------------------------------------

    // These IDs are only used when the database has NO divisions at all (fresh install).
    // If any divisions already exist, seeding is skipped entirely.
    private const string DivMiningId    = "div-mining";
    private const string DivSafetyId    = "div-safety";
    private const string DivTechId      = "div-tech";

    private static readonly (string Id, string Name, string? Description, int SortOrder)[] KnownDivisions =
    [
        (DivMiningId,  "Mining",    "Underground and surface mining products",  1),
        (DivSafetyId,  "Safety",    "Personnel and vehicle safety systems",     2),
        (DivTechId,    "Technology","Core technology and software platforms",   3),
    ];

    // Only seed divisions on a completely fresh database (no existing divisions).
    // If the user already has their own divisions, do nothing.
    private static void SeedDivisions(AppDbContext db)
    {
        if (db.Divisions.Any()) return; // user already has divisions — don't overwrite

        foreach (var (id, name, desc, sort) in KnownDivisions)
            db.Divisions.Add(new DivisionEntity { Id = id, Name = name, Description = desc, SortOrder = sort, IsActive = true });
    }

    // -----------------------------------------------------------------------
    // One-time cleanup of artifacts created by earlier seeder bugs
    // -----------------------------------------------------------------------

    /// <summary>
    /// Removes duplicate products and spurious seeded divisions that were created
    /// by a previous version of SeedDivisions/SeedProducts running when the user
    /// already had their own divisions and products.
    /// </summary>
    private static void CleanupSeederArtifacts(AppDbContext db)
    {
        // Remove the three hardcoded seeder divisions IF user-created divisions also exist.
        // If the user ONLY has these seeder divisions (fresh install), keep them.
        var seederDivIds = new[] { DivMiningId, DivSafetyId, DivTechId };
        var hasRealDivisions = db.Divisions.Any(d => !seederDivIds.Contains(d.Id));
        if (hasRealDivisions)
        {
            var toRemove = db.Divisions.Where(d => seederDivIds.Contains(d.Id)).ToList();
            foreach (var div in toRemove)
            {
                // Null-out any products pointing at these seeder division IDs
                var affected = db.Products.Where(p => p.DivisionId == div.Id).ToList();
                foreach (var p in affected) p.DivisionId = null;
                db.Divisions.Remove(div);
            }
        }

        // Remove duplicate products: keep the oldest (lowest Id lexicographically) per name.
        var allProducts = db.Products.OrderBy(p => p.Id).ToList();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var product in allProducts)
        {
            if (!seen.Add(product.Name))
                db.Products.Remove(product); // duplicate — remove the newer one
        }
    }

    // -----------------------------------------------------------------------
    // Product seeding
    // -----------------------------------------------------------------------

    // All known products. Add new products here — they will be inserted on
    // first startup if the name doesn't already exist in the database.
    private static readonly (string Name, string? Description, string? DivisionId)[] KnownProducts =
    [
        ("AIM-100",               "AIM-100 field device",                  DivMiningId),
        ("Commtrac",              "Commtrac core platform",                 DivTechId),
        ("EDGE AI",               "EDGE AI processing module",              DivTechId),
        ("Hazard Avert",          "Hazard detection and avoidance",         DivSafetyId),
        ("Hazard Avert - Gen 2",  "Hazard Avert second generation",         DivSafetyId),
        ("Ping Alert",            "Personnel alerting system",              DivSafetyId),
        ("New Ice Cream",         null,                                     null),
        ("Coffee",                null,                                     null),
    ];

    private static void SeedProducts(AppDbContext db)
    {
        // Only assign seeder division IDs if the seeder divisions actually exist in the DB.
        var seederDivIds = new HashSet<string> { DivMiningId, DivSafetyId, DivTechId };
        var existingDivIds = db.Divisions.Select(d => d.Id).ToHashSet();
        var useSeederDivisions = seederDivIds.Any(id => existingDivIds.Contains(id));

        var existingNames = db.Products.Select(p => p.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var (name, desc, divId) in KnownProducts)
        {
            if (!existingNames.Contains(name))
            {
                var assignedDivId = (useSeederDivisions && divId != null) ? divId : null;
                db.Products.Add(new ProductEntity { Name = name, Description = desc, DivisionId = assignedDivId });
            }
        }

        // Backfill DivisionId only on a fresh install where seeder divisions are in use
        if (useSeederDivisions)
        {
            var productsByName = db.Products.AsEnumerable()
                .GroupBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            foreach (var (name, _, divId) in KnownProducts)
            {
                if (divId != null && productsByName.TryGetValue(name, out var p) && p.DivisionId == null)
                    p.DivisionId = divId;
            }
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
    /// Handles migrations that were applied manually via Ensure* helper methods
    /// before the corresponding EF migration files were created. Inserts the missing
    /// migration history records so that Migrate() skips them and doesn't try to
    /// re-apply schema changes that already exist (which would cause duplicate-column errors).
    /// </summary>
    private static void FixEnsuredMigrations(AppDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            using var cmd = conn.CreateCommand();

            void EnsureRecorded(string migrationId, string detectSql)
            {
                cmd.CommandText = detectSql;
                var exists = Convert.ToInt64(cmd.ExecuteScalar()) > 0;
                if (!exists) return;

                cmd.CommandText = $"SELECT COUNT(*) FROM __EFMigrationsHistory WHERE MigrationId='{migrationId}'";
                var recorded = Convert.ToInt64(cmd.ExecuteScalar()) > 0;
                if (!recorded)
                {
                    cmd.CommandText = $"INSERT INTO __EFMigrationsHistory (MigrationId, ProductVersion) VALUES ('{migrationId}', '8.0.23')";
                    cmd.ExecuteNonQuery();
                }
            }

            // AssetDocuments/Revisions — created by EnsureAssetDocumentTables before migration existed
            EnsureRecorded("20260302000000_AssetDocuments",
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='AssetDocuments'");

            // AssetDocumentLinks — created by EnsureAssetDocumentLinksTables before migration existed
            EnsureRecorded("20260302100000_AssetDocumentLinks",
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='AssetDocumentLinks'");

            // RemoveUserIdField — safe to mark as applied; the DELETE is idempotent and harmless
            EnsureRecorded("20260302120000_RemoveUserIdField",
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='AssetDocumentLinks'");

            // RunTimeTracking — columns added by EnsureRunTimeTrackingColumns before migration existed
            EnsureRecorded("20260306090000_RunTimeTracking",
                "SELECT COUNT(*) FROM pragma_table_info('AssetWorkflowRuns') WHERE name='TimeTrackingJson'");

            // March-15 columns — added by EnsureMarch15Columns before migration files existed
            EnsureRecorded("20260315120000_ProjectAssetAsBuiltJson",
                "SELECT COUNT(*) FROM pragma_table_info('ProjectAssets') WHERE name='AsBuiltJson'");

            EnsureRecorded("20260315130000_AssetWorkflowRunBomActualJson",
                "SELECT COUNT(*) FROM pragma_table_info('AssetWorkflowRuns') WHERE name='BomActualJson'");

            // FeatureProcurementFields — columns added by EnsureFeatureProcurementColumns before migration
            // was discoverable (missing [Migration] attribute). Must be recorded before Migrate() runs.
            EnsureRecorded("20260321100000_FeatureProcurementFields",
                "SELECT COUNT(*) FROM pragma_table_info('Features') WHERE name='Brand'");

            // WorkflowModeAndInspectionImports — WorkflowMode column and InspectionImports table may have
            // been applied to the DB before the migration was discoverable.
            EnsureRecorded("20260322100000_WorkflowModeAndInspectionImports",
                "SELECT COUNT(*) FROM pragma_table_info('Projects') WHERE name='WorkflowMode'");

            // WorkflowTypeIdsForTemplatesAndConfigs — WorkflowTypeId columns added to WorkflowConfigs
            // and WorkflowTemplates before the migration was discoverable.
            EnsureRecorded("20260521120000_WorkflowTypeIdsForTemplatesAndConfigs",
                "SELECT COUNT(*) FROM pragma_table_info('WorkflowConfigs') WHERE name='WorkflowTypeId'");
        }
        finally
        {
            conn.Close();
        }
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

    /// <summary>
    /// Creates the AssetDocumentLinks bridge table (asset ↔ library document) if it
    /// doesn't exist. This table is created here rather than via an EF migration so
    /// it follows the same idempotent Ensure* pattern used by all other post-initial
    /// tables in this project.
    /// </summary>
    private static void EnsureAssetDocumentLinksTables(AppDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            using var cmd = conn.CreateCommand();

            cmd.CommandText = @"
                CREATE TABLE IF NOT EXISTS AssetDocumentLinks (
                    Id         TEXT PRIMARY KEY NOT NULL,
                    AssetId    TEXT NOT NULL DEFAULT '',
                    DocumentId TEXT NOT NULL DEFAULT '',
                    AttachedBy TEXT NULL,
                    AttachedAt TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
                )";
            cmd.ExecuteNonQuery();

            cmd.CommandText = @"
                CREATE INDEX IF NOT EXISTS IX_AssetDocumentLinks_AssetId
                ON AssetDocumentLinks (AssetId)";
            cmd.ExecuteNonQuery();

            cmd.CommandText = @"
                CREATE INDEX IF NOT EXISTS IX_AssetDocumentLinks_DocumentId
                ON AssetDocumentLinks (DocumentId)";
            cmd.ExecuteNonQuery();
        }
        finally
        {
            conn.Close();
        }
    }

    private static void EnsureDocumentTables(AppDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            using var cmd = conn.CreateCommand();

            // Add CreatedBy column to Documents if missing
            cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Documents') WHERE name='CreatedBy'";
            if (Convert.ToInt64(cmd.ExecuteScalar()) == 0)
            {
                cmd.CommandText = "ALTER TABLE Documents ADD COLUMN CreatedBy TEXT";
                cmd.ExecuteNonQuery();
            }

            // Add Notes column to Documents if missing
            cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Documents') WHERE name='Notes'";
            if (Convert.ToInt64(cmd.ExecuteScalar()) == 0)
            {
                cmd.CommandText = "ALTER TABLE Documents ADD COLUMN Notes TEXT";
                cmd.ExecuteNonQuery();
            }

            // Add CustomValuesJson column to Documents if missing
            cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Documents') WHERE name='CustomValuesJson'";
            if (Convert.ToInt64(cmd.ExecuteScalar()) == 0)
            {
                cmd.CommandText = "ALTER TABLE Documents ADD COLUMN CustomValuesJson TEXT";
                cmd.ExecuteNonQuery();
            }

            // Add DownloadUrl column to Documents if missing
            cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Documents') WHERE name='DownloadUrl'";
            if (Convert.ToInt64(cmd.ExecuteScalar()) == 0)
            {
                cmd.CommandText = "ALTER TABLE Documents ADD COLUMN DownloadUrl TEXT";
                cmd.ExecuteNonQuery();
            }

            // Create DocumentConfigs table if missing
            cmd.CommandText = @"
                CREATE TABLE IF NOT EXISTS DocumentConfigs (
                    Id INTEGER PRIMARY KEY NOT NULL,
                    TabsJson TEXT NOT NULL DEFAULT '[]',
                    FieldsJson TEXT NOT NULL DEFAULT '[]'
                )";
            cmd.ExecuteNonQuery();
        }
        finally
        {
            conn.Close();
        }
    }

    /// <summary>
    /// Creates AssetDocuments and AssetDocumentRevisions if missing.
    /// This protects environments where migration history drifted and the
    /// EF migration for these tables was not discovered/applied.
    /// </summary>
    private static void EnsureAssetDocumentTables(AppDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            using var cmd = conn.CreateCommand();

            cmd.CommandText = @"
                CREATE TABLE IF NOT EXISTS AssetDocuments (
                    Id        TEXT PRIMARY KEY NOT NULL,
                    AssetId   TEXT NOT NULL DEFAULT '',
                    Label     TEXT NOT NULL DEFAULT 'Document',
                    CreatedBy TEXT NULL,
                    CreatedAt TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
                )";
            cmd.ExecuteNonQuery();

            cmd.CommandText = @"
                CREATE INDEX IF NOT EXISTS IX_AssetDocuments_AssetId
                ON AssetDocuments (AssetId)";
            cmd.ExecuteNonQuery();

            cmd.CommandText = @"
                CREATE TABLE IF NOT EXISTS AssetDocumentRevisions (
                    Id             TEXT PRIMARY KEY NOT NULL,
                    DocumentId     TEXT NOT NULL DEFAULT '',
                    RevisionNumber INTEGER NOT NULL DEFAULT 1,
                    OriginalName   TEXT NOT NULL DEFAULT '',
                    StoredName     TEXT NOT NULL DEFAULT '',
                    MimeType       TEXT NOT NULL DEFAULT '',
                    FileSizeBytes  INTEGER NOT NULL DEFAULT 0,
                    UploadedBy     TEXT NULL,
                    UploadedAt     TEXT NOT NULL DEFAULT '0001-01-01T00:00:00'
                )";
            cmd.ExecuteNonQuery();

            cmd.CommandText = @"
                CREATE INDEX IF NOT EXISTS IX_AssetDocumentRevisions_DocumentId
                ON AssetDocumentRevisions (DocumentId)";
            cmd.ExecuteNonQuery();
        }
        finally
        {
            conn.Close();
        }
    }

    /// <summary>
    /// Adds columns from the March-15 migrations that may be missing when the database
    /// was restored from a pre-March-15 backup but the migration history already records
    /// those migrations as applied (schema/history mismatch after a restore).
    /// </summary>
    private static void EnsureMarch15Columns(AppDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            using var cmd = conn.CreateCommand();

            // 20260315120000_ProjectAssetAsBuiltJson
            cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('ProjectAssets') WHERE name='AsBuiltJson'";
            if (Convert.ToInt64(cmd.ExecuteScalar()) == 0)
            {
                cmd.CommandText = "ALTER TABLE ProjectAssets ADD COLUMN AsBuiltJson TEXT NOT NULL DEFAULT '{}'";
                cmd.ExecuteNonQuery();
            }

            // 20260315130000_AssetWorkflowRunBomActualJson
            cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('AssetWorkflowRuns') WHERE name='BomActualJson'";
            if (Convert.ToInt64(cmd.ExecuteScalar()) == 0)
            {
                cmd.CommandText = "ALTER TABLE AssetWorkflowRuns ADD COLUMN BomActualJson TEXT NOT NULL DEFAULT '[]'";
                cmd.ExecuteNonQuery();
            }
        }
        finally
        {
            conn.Close();
        }
    }

    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    private class RawFeature
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string ValueType { get; set; } = "text";
        public List<string>? Options { get; set; }
        public List<JsonElement>? SubProperties { get; set; }
    }

    /// <summary>
    /// One-time migration: reads each product's FeaturesJson and promotes features
    /// to the global Features table, preserving original IDs so that workflow step
    /// featureId references remain valid. Idempotent — skips features already in the table.
    /// </summary>
    private static void MigrateProductFeaturesToGlobalLibrary(AppDbContext db)
    {
        var products = db.Products.ToList();
        if (!products.Any()) return;

        var existingFeatureIds = db.Features.Select(f => f.Id).ToHashSet();
        var existingLinks = db.ProductFeatures
            .Select(pf => new { pf.ProductId, pf.FeatureId })
            .ToHashSet(EqualityComparer<dynamic>.Default);

        // Build a stable set of existing (productId, featureId) pairs for dedup
        var existingLinkSet = db.ProductFeatures
            .Select(pf => pf.ProductId + "|" + pf.FeatureId)
            .ToHashSet();

        int sortOrder = 0;
        foreach (var product in products)
        {
            if (string.IsNullOrWhiteSpace(product.FeaturesJson) || product.FeaturesJson == "[]")
                continue;

            List<RawFeature> features;
            try
            {
                features = JsonSerializer.Deserialize<List<RawFeature>>(product.FeaturesJson, JsonOpts)
                           ?? new List<RawFeature>();
            }
            catch { continue; }

            sortOrder = 0;
            foreach (var f in features)
            {
                if (string.IsNullOrWhiteSpace(f.Id) || string.IsNullOrWhiteSpace(f.Name)) continue;

                // Create global Feature row if not already present
                if (!existingFeatureIds.Contains(f.Id))
                {
                    db.Features.Add(new FeatureEntity
                    {
                        Id = f.Id,
                        Name = f.Name,
                        ValueType = string.IsNullOrWhiteSpace(f.ValueType) ? "text" : f.ValueType,
                        OptionsJson = f.Options is { Count: > 0 }
                            ? JsonSerializer.Serialize(f.Options, JsonOpts) : "[]",
                        SubPropertiesJson = f.SubProperties is { Count: > 0 }
                            ? JsonSerializer.Serialize(f.SubProperties, JsonOpts) : "[]"
                    });
                    existingFeatureIds.Add(f.Id);
                }

                // Create product↔feature link if not already present
                var linkKey = product.Id + "|" + f.Id;
                if (!existingLinkSet.Contains(linkKey))
                {
                    db.ProductFeatures.Add(new ProductFeatureEntity
                    {
                        ProductId = product.Id,
                        FeatureId = f.Id,
                        SortOrder = sortOrder++
                    });
                    existingLinkSet.Add(linkKey);
                }
            }
        }
    }

    /// <summary>
    /// Adds procurement columns to Features table if missing.
    /// These columns were added to FeatureEntity but the DB may not have them yet.
    /// </summary>
    private static void EnsureFeatureProcurementColumns(AppDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            using var cmd = conn.CreateCommand();

            void AddIfMissing(string col, string colDef)
            {
                cmd.CommandText = $"SELECT COUNT(*) FROM pragma_table_info('Features') WHERE name='{col}'";
                if (Convert.ToInt64(cmd.ExecuteScalar()) == 0)
                {
                    cmd.CommandText = $"ALTER TABLE Features ADD COLUMN {col} {colDef}";
                    cmd.ExecuteNonQuery();
                }
            }

            AddIfMissing("Brand",                 "TEXT NULL");
            AddIfMissing("Supplier",              "TEXT NULL");
            AddIfMissing("AlternativePartNumber",   "TEXT NULL");
            AddIfMissing("ManufacturerPartNumber", "TEXT NULL");
            AddIfMissing("UnitPrice",              "TEXT NULL");  // stored as TEXT/REAL; nullable decimal
            AddIfMissing("ProductLink",           "TEXT NULL");
        }
        finally
        {
            conn.Close();
        }
    }

    /// <summary>
    /// Adds run time-tracking columns to AssetWorkflowRuns if missing.
    /// </summary>
    private static void EnsureRunTimeTrackingColumns(AppDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        try
        {
            using var cmd = conn.CreateCommand();

            cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('AssetWorkflowRuns') WHERE name='TimeTrackingJson'";
            if (Convert.ToInt64(cmd.ExecuteScalar()) == 0)
            {
                cmd.CommandText = "ALTER TABLE AssetWorkflowRuns ADD COLUMN TimeTrackingJson TEXT NOT NULL DEFAULT '[]'";
                cmd.ExecuteNonQuery();
            }

            cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('AssetWorkflowRuns') WHERE name='ProductiveSeconds'";
            if (Convert.ToInt64(cmd.ExecuteScalar()) == 0)
            {
                cmd.CommandText = "ALTER TABLE AssetWorkflowRuns ADD COLUMN ProductiveSeconds INTEGER NOT NULL DEFAULT 0";
                cmd.ExecuteNonQuery();
            }

            cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('AssetWorkflowRuns') WHERE name='DowntimeSeconds'";
            if (Convert.ToInt64(cmd.ExecuteScalar()) == 0)
            {
                cmd.CommandText = "ALTER TABLE AssetWorkflowRuns ADD COLUMN DowntimeSeconds INTEGER NOT NULL DEFAULT 0";
                cmd.ExecuteNonQuery();
            }

            cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('AssetWorkflowRuns') WHERE name='DowntimeEvents'";
            if (Convert.ToInt64(cmd.ExecuteScalar()) == 0)
            {
                cmd.CommandText = "ALTER TABLE AssetWorkflowRuns ADD COLUMN DowntimeEvents INTEGER NOT NULL DEFAULT 0";
                cmd.ExecuteNonQuery();
            }
        }
        finally
        {
            conn.Close();
        }
    }
}
