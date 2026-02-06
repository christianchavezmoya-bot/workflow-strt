using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Commtrac.Api.Models;

namespace Commtrac.Api.Data;

public class AppDbContext : DbContext
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<UserEntity> Users => Set<UserEntity>();
    public DbSet<CustomerEntity> Customers => Set<CustomerEntity>();
    public DbSet<SiteEntity> Sites => Set<SiteEntity>();
    public DbSet<ProductEntity> Products => Set<ProductEntity>();
    public DbSet<AssetEntity> Assets => Set<AssetEntity>();
    public DbSet<ProjectEntity> Projects => Set<ProjectEntity>();
    public DbSet<InstallationEntity> Installations => Set<InstallationEntity>();
    public DbSet<CustomFieldDefinitionEntity> CustomFieldDefinitions => Set<CustomFieldDefinitionEntity>();
    public DbSet<InspectionEntity> Inspections => Set<InspectionEntity>();
    public DbSet<InspectionPhotoEntity> InspectionPhotos => Set<InspectionPhotoEntity>();
    public DbSet<IssueEntity> Issues => Set<IssueEntity>();
    public DbSet<DocumentEntity> Documents => Set<DocumentEntity>();
    public DbSet<QuickbaseSettingsEntity> QuickbaseSettings => Set<QuickbaseSettingsEntity>();
    public DbSet<FieldDefinitionEntity> FieldDefinitions => Set<FieldDefinitionEntity>();
    public DbSet<FieldValueEntity> FieldValues => Set<FieldValueEntity>();
    public DbSet<AdminTabEntity> AdminTabs => Set<AdminTabEntity>();
    public DbSet<AdminTabRowEntity> AdminTabRows => Set<AdminTabRowEntity>();
    public DbSet<InstallationTabEntity> InstallationTabs => Set<InstallationTabEntity>();
    public DbSet<InstallationTabRowEntity> InstallationTabRows => Set<InstallationTabRowEntity>();
    public DbSet<TableConfigEntity> TableConfigs => Set<TableConfigEntity>();
    public DbSet<RoleConfigEntity> RoleConfigs => Set<RoleConfigEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var listConverter = new ValueConverter<List<string>, string>(
            v => JsonSerializer.Serialize(v, JsonOptions),
            v => string.IsNullOrWhiteSpace(v) ? new List<string>() : JsonSerializer.Deserialize<List<string>>(v, JsonOptions) ?? new List<string>()
        );
        var listComparer = new ValueComparer<List<string>>(
            (l, r) => (l ?? new List<string>()).SequenceEqual(r ?? new List<string>()),
            v => (v ?? new List<string>()).Aggregate(0, (acc, item) => HashCode.Combine(acc, item.GetHashCode())),
            v => v == null ? new List<string>() : v.ToList()
        );

        modelBuilder.Entity<ProjectEntity>()
            .Property(p => p.ProductIds)
            .HasConversion(listConverter)
            .Metadata.SetValueComparer(listComparer);

        modelBuilder.Entity<InstallationEntity>()
            .Property(i => i.AssignedUsers)
            .HasConversion(listConverter)
            .Metadata.SetValueComparer(listComparer);

        modelBuilder.Entity<InstallationEntity>()
            .Property(i => i.CustomFieldsJson)
            .HasDefaultValue("{}");

        modelBuilder.Entity<CustomFieldDefinitionEntity>()
            .Property(f => f.OptionsJson)
            .HasDefaultValue("[]");

        modelBuilder.Entity<QuickbaseSettingsEntity>()
            .Property(s => s.ProjectsFieldMapJson)
            .HasDefaultValue("{}");

        modelBuilder.Entity<QuickbaseSettingsEntity>()
            .Property(s => s.InstallationsFieldMapJson)
            .HasDefaultValue("{}");

        modelBuilder.Entity<TableConfigEntity>()
            .HasIndex(t => t.TableName)
            .IsUnique();

        modelBuilder.Entity<TableConfigEntity>()
            .Property(t => t.OrderJson)
            .HasDefaultValue("[]");

        modelBuilder.Entity<TableConfigEntity>()
            .Property(t => t.HiddenJson)
            .HasDefaultValue("[]");

        modelBuilder.Entity<TableConfigEntity>()
            .Property(t => t.BaseFieldNamesJson)
            .HasDefaultValue("{}");

        modelBuilder.Entity<SiteEntity>()
            .HasIndex(s => s.CustomerId);

        modelBuilder.Entity<FieldDefinitionEntity>()
            .HasData(new[]
            {
                new FieldDefinitionEntity { Id = "field-job-number", Name = "Job Number", FieldType = "primary key", TablesJson = JsonSerializer.Serialize(new[] { "projects", "installations" }, JsonOptions), SortOrder = 1, IsActive = true },
                new FieldDefinitionEntity { Id = "field-project-type", Name = "Project Type", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "projects" }, JsonOptions), SortOrder = 2, IsActive = true },
                new FieldDefinitionEntity { Id = "field-customer", Name = "Customer", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "projects", "customers" }, JsonOptions), SortOrder = 3, IsActive = true },
                new FieldDefinitionEntity { Id = "field-products", Name = "Products", FieldType = "multi-select", TablesJson = JsonSerializer.Serialize(new[] { "projects", "products" }, JsonOptions), SortOrder = 4, IsActive = true },
                new FieldDefinitionEntity { Id = "field-status", Name = "Status", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "projects", "installations", "inspections", "issues" }, JsonOptions), SortOrder = 5, IsActive = true },
                new FieldDefinitionEntity { Id = "field-office", Name = "Office", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "projects", "customers", "users" }, JsonOptions), SortOrder = 6, IsActive = true },
                new FieldDefinitionEntity { Id = "field-site-name", Name = "Site Name", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations" }, JsonOptions), SortOrder = 7, IsActive = true },
                new FieldDefinitionEntity { Id = "field-start-date", Name = "Start Date", FieldType = "date", TablesJson = JsonSerializer.Serialize(new[] { "installations", "issues" }, JsonOptions), SortOrder = 8, IsActive = true },
                new FieldDefinitionEntity { Id = "field-finish-date", Name = "Finish Date", FieldType = "date", TablesJson = JsonSerializer.Serialize(new[] { "issues" }, JsonOptions), SortOrder = 9, IsActive = true },
                new FieldDefinitionEntity { Id = "field-progress", Name = "Progress", FieldType = "percentage", TablesJson = JsonSerializer.Serialize(new[] { "installations" }, JsonOptions), SortOrder = 10, IsActive = true },
                new FieldDefinitionEntity { Id = "field-installer", Name = "Installer", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations", "inspections" }, JsonOptions), SortOrder = 11, IsActive = true },
                new FieldDefinitionEntity { Id = "field-inspector", Name = "Inspector", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "inspections" }, JsonOptions), SortOrder = 12, IsActive = true },
                new FieldDefinitionEntity { Id = "field-photos", Name = "Photos", FieldType = "number", TablesJson = JsonSerializer.Serialize(new[] { "inspections" }, JsonOptions), SortOrder = 13, IsActive = true },
                new FieldDefinitionEntity { Id = "field-issue", Name = "Issue", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "issues" }, JsonOptions), SortOrder = 14, IsActive = true },
                new FieldDefinitionEntity { Id = "field-priority", Name = "Priority", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "issues" }, JsonOptions), SortOrder = 15, IsActive = true },
                new FieldDefinitionEntity { Id = "field-owner", Name = "Owner", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "issues" }, JsonOptions), SortOrder = 16, IsActive = true },
                new FieldDefinitionEntity { Id = "field-machine-type", Name = "Machine Type", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations", "assets" }, JsonOptions), SortOrder = 17, IsActive = true },
                new FieldDefinitionEntity { Id = "field-pm1", Name = "PM-1 S/N", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations" }, JsonOptions), SortOrder = 18, IsActive = true },
                new FieldDefinitionEntity { Id = "field-pm2", Name = "PM-2 S/N", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations" }, JsonOptions), SortOrder = 19, IsActive = true },
                new FieldDefinitionEntity { Id = "field-pm3", Name = "PM-3 S/N", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations" }, JsonOptions), SortOrder = 20, IsActive = true },
                new FieldDefinitionEntity { Id = "field-pm4", Name = "PM-4 S/N", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations" }, JsonOptions), SortOrder = 21, IsActive = true },
                new FieldDefinitionEntity { Id = "field-asset-id", Name = "Asset ID#", FieldType = "primary key", TablesJson = JsonSerializer.Serialize(new[] { "assets" }, JsonOptions), SortOrder = 22, IsActive = true },
                new FieldDefinitionEntity { Id = "field-machine-id", Name = "Machine ID", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "assets" }, JsonOptions), SortOrder = 23, IsActive = true },
                new FieldDefinitionEntity { Id = "field-serial-number", Name = "Serial Number", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "assets" }, JsonOptions), SortOrder = 24, IsActive = true },
                new FieldDefinitionEntity { Id = "field-pm-count", Name = "PM Count", FieldType = "number", TablesJson = JsonSerializer.Serialize(new[] { "assets" }, JsonOptions), SortOrder = 25, IsActive = true },
                new FieldDefinitionEntity { Id = "field-comments", Name = "Comments", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "assets" }, JsonOptions), SortOrder = 26, IsActive = true },
                new FieldDefinitionEntity { Id = "field-document", Name = "Document", FieldType = "file", TablesJson = JsonSerializer.Serialize(new[] { "documents" }, JsonOptions), SortOrder = 27, IsActive = true },
                new FieldDefinitionEntity { Id = "field-document-type", Name = "Document Type", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "documents" }, JsonOptions), SortOrder = 28, IsActive = true },
                new FieldDefinitionEntity { Id = "field-linked-to", Name = "Linked To", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "documents" }, JsonOptions), SortOrder = 29, IsActive = true },
                new FieldDefinitionEntity { Id = "field-uploaded-at", Name = "Uploaded At", FieldType = "date", TablesJson = JsonSerializer.Serialize(new[] { "documents" }, JsonOptions), SortOrder = 30, IsActive = true },
                new FieldDefinitionEntity { Id = "field-user-name", Name = "User Name", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "users" }, JsonOptions), SortOrder = 31, IsActive = true },
                new FieldDefinitionEntity { Id = "field-email", Name = "Email", FieldType = "email", TablesJson = JsonSerializer.Serialize(new[] { "users" }, JsonOptions), SortOrder = 32, IsActive = true },
                new FieldDefinitionEntity { Id = "field-role", Name = "Role", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "users" }, JsonOptions), SortOrder = 33, IsActive = true },
                new FieldDefinitionEntity { Id = "field-active", Name = "Active", FieldType = "checkbox", TablesJson = JsonSerializer.Serialize(new[] { "users" }, JsonOptions), SortOrder = 34, IsActive = true }
            });
    }
}
