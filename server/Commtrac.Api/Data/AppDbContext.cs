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
    public DbSet<DivisionEntity> Divisions => Set<DivisionEntity>();
    public DbSet<FeatureEntity> Features => Set<FeatureEntity>();
    public DbSet<FeatureDependencyEntity> FeatureDependencies => Set<FeatureDependencyEntity>();
    public DbSet<ProductFeatureEntity> ProductFeatures => Set<ProductFeatureEntity>();
    public DbSet<ProductEntity> Products => Set<ProductEntity>();
    public DbSet<AssetEntity> Assets => Set<AssetEntity>();
    public DbSet<ProjectEntity> Projects => Set<ProjectEntity>();
    public DbSet<InstallationEntity> Installations => Set<InstallationEntity>();
    public DbSet<CustomFieldDefinitionEntity> CustomFieldDefinitions => Set<CustomFieldDefinitionEntity>();
    public DbSet<InspectionEntity> Inspections => Set<InspectionEntity>();
    public DbSet<InspectionPhotoEntity> InspectionPhotos => Set<InspectionPhotoEntity>();
    public DbSet<IssueEntity> Issues => Set<IssueEntity>();
    public DbSet<DocumentEntity> Documents => Set<DocumentEntity>();
    public DbSet<DocumentConfigEntity> DocumentConfigs => Set<DocumentConfigEntity>();
    public DbSet<QuickbaseSettingsEntity> QuickbaseSettings => Set<QuickbaseSettingsEntity>();
    public DbSet<NotificationSettingsEntity> NotificationSettings => Set<NotificationSettingsEntity>();
    public DbSet<FieldDefinitionEntity> FieldDefinitions => Set<FieldDefinitionEntity>();
    public DbSet<FieldValueEntity> FieldValues => Set<FieldValueEntity>();
    public DbSet<AdminTabEntity> AdminTabs => Set<AdminTabEntity>();
    public DbSet<AdminTabRowEntity> AdminTabRows => Set<AdminTabRowEntity>();
    public DbSet<InstallationTabEntity> InstallationTabs => Set<InstallationTabEntity>();
    public DbSet<InstallationTabRowEntity> InstallationTabRows => Set<InstallationTabRowEntity>();
    public DbSet<TableConfigEntity> TableConfigs => Set<TableConfigEntity>();
    public DbSet<RoleConfigEntity> RoleConfigs => Set<RoleConfigEntity>();
    public DbSet<OfficeEntity> Offices => Set<OfficeEntity>();
    public DbSet<AuditLogEntity> AuditLogs => Set<AuditLogEntity>();
    public DbSet<SessionEntity> Sessions => Set<SessionEntity>();
    public DbSet<WorkflowTemplateEntity> WorkflowTemplates => Set<WorkflowTemplateEntity>();
    public DbSet<WorkInstructionTemplateEntity> WorkInstructionTemplates => Set<WorkInstructionTemplateEntity>();
    public DbSet<WorkInstructionEntity> WorkInstructions => Set<WorkInstructionEntity>();
    public DbSet<WorkOrderEntity> WorkOrders => Set<WorkOrderEntity>();
    public DbSet<ProjectAssetEntity> ProjectAssets => Set<ProjectAssetEntity>();
    // ─── v2 Workflow Config Unification ───────────────────────────────────────
    public DbSet<WorkflowConfigEntity> WorkflowConfigs => Set<WorkflowConfigEntity>();
    public DbSet<WorkflowConfigFeatureEntity> WorkflowConfigFeatures => Set<WorkflowConfigFeatureEntity>();
    public DbSet<WorkflowTypeEntity> WorkflowTypes => Set<WorkflowTypeEntity>();
    public DbSet<AssetWorkflowAssignmentEntity> AssetWorkflowAssignments => Set<AssetWorkflowAssignmentEntity>();
    public DbSet<AssetWorkflowRunEntity> AssetWorkflowRuns => Set<AssetWorkflowRunEntity>();
    public DbSet<BrandSettingEntity> BrandSettings => Set<BrandSettingEntity>();
    // ─── Asset Documents ──────────────────────────────────────────────────────
    public DbSet<AssetDocumentEntity> AssetDocuments => Set<AssetDocumentEntity>();
    public DbSet<AssetDocumentRevisionEntity> AssetDocumentRevisions => Set<AssetDocumentRevisionEntity>();
    // ─── Asset Document Links (library references per asset) ─────────────────
    public DbSet<AssetDocumentLinkEntity> AssetDocumentLinks => Set<AssetDocumentLinkEntity>();
    // ─── Project CRM ──────────────────────────────────────────────────────────
    public DbSet<ProjectContactEntity> ProjectContacts => Set<ProjectContactEntity>();
    public DbSet<ProjectDeliveryProfileEntity> ProjectDeliveryProfiles => Set<ProjectDeliveryProfileEntity>();
    public DbSet<ProjectInboundItemEntity> ProjectInboundItems => Set<ProjectInboundItemEntity>();
    // ─── Signatures ───────────────────────────────────────────────────────────
    public DbSet<SignatureEventEntity> SignatureEvents => Set<SignatureEventEntity>();
    public DbSet<SignatureTokenEntity> SignatureTokens => Set<SignatureTokenEntity>();
    // ─── Dispatch / Logistics ─────────────────────────────────────────────────
    public DbSet<DispatchOrderEntity> DispatchOrders => Set<DispatchOrderEntity>();
    public DbSet<DispatchLineEntity> DispatchLines => Set<DispatchLineEntity>();
    public DbSet<DeliveryEventEntity> DeliveryEvents => Set<DeliveryEventEntity>();
    // ─── BOM-to-Project Module (removable) ────────────────────────────────────
    public DbSet<BomImportRunEntity> BomImportRuns => Set<BomImportRunEntity>();
    public DbSet<BomMappingProfileEntity> BomMappingProfiles => Set<BomMappingProfileEntity>();
    public DbSet<BomRuleProfileEntity> BomRuleProfiles => Set<BomRuleProfileEntity>();
    // ─── Inspection Imports ───────────────────────────────────────────────────
    public DbSet<InspectionImportEntity> InspectionImports => Set<InspectionImportEntity>();

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

        modelBuilder.Entity<FeatureDependencyEntity>()
            .HasIndex(d => d.FeatureId);

        modelBuilder.Entity<FeatureDependencyEntity>()
            .Property(d => d.CaptureFieldsJson)
            .HasDefaultValue("[]");

        modelBuilder.Entity<FeatureEntity>()
            .Property(f => f.OptionsJson)
            .HasDefaultValue("[]");

        modelBuilder.Entity<FeatureEntity>()
            .Property(f => f.SubPropertiesJson)
            .HasDefaultValue("[]");

        modelBuilder.Entity<ProductFeatureEntity>()
            .HasIndex(pf => pf.ProductId);

        modelBuilder.Entity<ProductFeatureEntity>()
            .HasIndex(pf => pf.FeatureId);

        modelBuilder.Entity<ProductEntity>()
            .Property(p => p.FeaturesJson)
            .HasDefaultValue("[]");

        modelBuilder.Entity<ProjectEntity>()
            .Property(p => p.ProductFeatureValuesJson)
            .HasDefaultValue("{}");

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

        modelBuilder.Entity<TableConfigEntity>()
            .Property(t => t.BaseFieldMetaJson)
            .HasDefaultValue("{}");

        // Foreign key relationships and indexes
        modelBuilder.Entity<SiteEntity>()
            .HasIndex(s => s.CustomerId);

        // Sites must belong to a Customer
        // Note: Using string IDs without navigation properties for simplicity
        // Foreign keys are enforced at application level rather than database level
        // to avoid circular dependencies and maintain flexibility

        modelBuilder.Entity<InspectionEntity>()
            .HasIndex(i => i.InstallationId);

        modelBuilder.Entity<IssueEntity>()
            .HasIndex(i => i.InstallationId);

        modelBuilder.Entity<InspectionPhotoEntity>()
            .HasIndex(p => p.InspectionId);

        modelBuilder.Entity<InstallationEntity>()
            .HasIndex(i => i.ProjectId);

        modelBuilder.Entity<FieldValueEntity>()
            .HasIndex(v => new { v.TableName, v.EntityId });

        modelBuilder.Entity<FieldValueEntity>()
            .HasIndex(v => v.FieldDefinitionId);

        modelBuilder.Entity<AuditLogEntity>()
            .HasIndex(a => a.UserId);

        modelBuilder.Entity<AuditLogEntity>()
            .HasIndex(a => a.Timestamp);

        modelBuilder.Entity<SessionEntity>()
            .HasIndex(s => s.UserId);

        modelBuilder.Entity<WorkflowTemplateEntity>()
            .Property(w => w.StepsJson)
            .HasDefaultValue("[]");

        modelBuilder.Entity<WorkflowTemplateEntity>()
            .Property(w => w.MediaJson)
            .HasDefaultValue("[]");

        modelBuilder.Entity<WorkflowTemplateEntity>()
            .HasIndex(w => w.ProductId);

        modelBuilder.Entity<WorkflowTemplateEntity>()
            .HasIndex(w => w.WorkflowTypeId);

        modelBuilder.Entity<WorkInstructionEntity>()
            .Property(w => w.StepsJson)
            .HasDefaultValue("[]");

        modelBuilder.Entity<WorkInstructionEntity>()
            .Property(w => w.FeatureValuesJson)
            .HasDefaultValue("{}");

        modelBuilder.Entity<WorkInstructionEntity>()
            .HasIndex(w => w.ProductId);

        modelBuilder.Entity<WorkOrderEntity>()
            .Property(w => w.StepsDataJson)
            .HasDefaultValue("[]");

        modelBuilder.Entity<WorkOrderEntity>()
            .HasIndex(w => w.ProductId);

        modelBuilder.Entity<WorkOrderEntity>()
            .HasIndex(w => w.WorkflowTemplateId);

        modelBuilder.Entity<ProjectAssetEntity>()
            .HasIndex(a => a.ProjectId);

        modelBuilder.Entity<ProjectAssetEntity>()
            .HasIndex(a => a.ProductId);

        modelBuilder.Entity<ProjectAssetEntity>()
            .HasIndex(a => a.ProductConfigId);

        // ─── WorkflowConfigFeature indexes ───────────────────────────────────
        modelBuilder.Entity<WorkflowConfigFeatureEntity>()
            .HasIndex(f => f.WorkflowConfigId);

        modelBuilder.Entity<WorkflowConfigFeatureEntity>()
            .HasIndex(f => f.FeatureId);

        modelBuilder.Entity<WorkflowConfigFeatureEntity>()
            .Property(f => f.InclusionsJson)
            .HasDefaultValue("{}");

        // ─── v2 WorkflowConfig indexes ────────────────────────────────────────
        modelBuilder.Entity<WorkflowConfigEntity>()
            .HasIndex(c => c.ProductId);

        modelBuilder.Entity<WorkflowConfigEntity>()
            .HasIndex(c => c.Status);

        modelBuilder.Entity<WorkflowConfigEntity>()
            .HasIndex(c => c.WorkflowTypeId);

        modelBuilder.Entity<WorkflowConfigEntity>()
            .Property(c => c.StepsJson).HasDefaultValue("[]");

        modelBuilder.Entity<WorkflowConfigEntity>()
            .Property(c => c.MediaJson).HasDefaultValue("[]");

        modelBuilder.Entity<WorkflowConfigEntity>()
            .Property(c => c.FeatureSelectionsJson).HasDefaultValue("[]");

        modelBuilder.Entity<AssetWorkflowAssignmentEntity>()
            .HasIndex(a => a.AssetId);

        modelBuilder.Entity<AssetWorkflowAssignmentEntity>()
            .HasIndex(a => a.WorkflowConfigId);

        modelBuilder.Entity<AssetWorkflowRunEntity>()
            .HasIndex(r => r.AssetId);

        modelBuilder.Entity<AssetWorkflowRunEntity>()
            .HasIndex(r => r.WorkflowConfigId);

        modelBuilder.Entity<AssetWorkflowRunEntity>()
            .Property(r => r.StepResultsJson).HasDefaultValue("[]");

        modelBuilder.Entity<AssetWorkflowRunEntity>()
            .Property(r => r.IssuesJson).HasDefaultValue("[]");

        modelBuilder.Entity<AssetWorkflowRunEntity>()
            .Property(r => r.WorkflowSnapshotJson).HasDefaultValue("{}");

        modelBuilder.Entity<AssetWorkflowRunEntity>()
            .Property(r => r.TimeTrackingJson).HasDefaultValue("[]");

        // ─── Asset Document indexes ───────────────────────────────────────────
        modelBuilder.Entity<AssetDocumentEntity>()
            .HasIndex(d => d.AssetId);

        modelBuilder.Entity<AssetDocumentRevisionEntity>()
            .HasIndex(r => r.DocumentId);

        modelBuilder.Entity<AssetDocumentLinkEntity>()
            .HasIndex(l => l.AssetId);

        modelBuilder.Entity<AssetDocumentLinkEntity>()
            .HasIndex(l => l.DocumentId);

        // Seed default WorkflowTypes
        modelBuilder.Entity<WorkflowTypeEntity>().HasData(
            new WorkflowTypeEntity { Id = "wftype-installation",   Name = "Installation",   SortOrder = 1, IsActive = true },
            new WorkflowTypeEntity { Id = "wftype-commissioning",  Name = "Commissioning",  SortOrder = 2, IsActive = true },
            new WorkflowTypeEntity { Id = "wftype-inspection",     Name = "Inspection",     SortOrder = 3, IsActive = true },
            new WorkflowTypeEntity { Id = "wftype-repair",         Name = "Repair",         SortOrder = 4, IsActive = true },
            new WorkflowTypeEntity { Id = "wftype-other",          Name = "Other",          SortOrder = 5, IsActive = true }
        );

        modelBuilder.Entity<FieldDefinitionEntity>()
            .HasData(new[]
            {
                new FieldDefinitionEntity { Id = "field-job-number", Name = "Job Number", FieldType = "primary key", TablesJson = JsonSerializer.Serialize(new[] { "projects", "installations" }, JsonOptions), SortOrder = 1, IsActive = true },
                new FieldDefinitionEntity { Id = "field-project-type", Name = "Project Type", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "projects" }, JsonOptions), SortOrder = 2, IsActive = true },
                new FieldDefinitionEntity { Id = "field-customer", Name = "Customer", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "projects", "customers" }, JsonOptions), SortOrder = 3, IsActive = true },
                new FieldDefinitionEntity { Id = "field-products", Name = "Products", FieldType = "multi-select", TablesJson = JsonSerializer.Serialize(new[] { "projects", "products" }, JsonOptions), SortOrder = 4, IsActive = true },
                new FieldDefinitionEntity { Id = "field-status", Name = "Status", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "projects", "installations", "inspections", "issues" }, JsonOptions), SortOrder = 5, IsActive = true },
                new FieldDefinitionEntity { Id = "field-office", Name = "Global Offices", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "projects", "customers", "users" }, JsonOptions), SortOrder = 6, IsActive = true },
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
                new FieldDefinitionEntity { Id = "field-active", Name = "Active", FieldType = "checkbox", TablesJson = JsonSerializer.Serialize(new[] { "users" }, JsonOptions), SortOrder = 34, IsActive = true },
                new FieldDefinitionEntity { Id = "field-site-address", Name = "Address", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 35, IsActive = true },
                new FieldDefinitionEntity { Id = "field-site-city", Name = "City", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 36, IsActive = true },
                new FieldDefinitionEntity { Id = "field-site-state", Name = "State", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 37, IsActive = true },
                new FieldDefinitionEntity { Id = "field-site-country", Name = "Country", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 38, IsActive = true },
                new FieldDefinitionEntity { Id = "field-site-zipcode", Name = "Zip Code", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 39, IsActive = true },
                new FieldDefinitionEntity { Id = "field-site-contact-name", Name = "Contact Name", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 40, IsActive = true },
                new FieldDefinitionEntity { Id = "field-site-contact-phone", Name = "Contact Phone", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 41, IsActive = true },
                new FieldDefinitionEntity { Id = "field-site-contact-email", Name = "Contact Email", FieldType = "email", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 42, IsActive = true },
                new FieldDefinitionEntity { Id = "field-site-notes", Name = "Notes", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 43, IsActive = true },
                new FieldDefinitionEntity { Id = "field-customer-id", Name = "Customer ID", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "customers" }, JsonOptions), SortOrder = 44, IsActive = true },
                new FieldDefinitionEntity { Id = "field-customer-industry", Name = "Industry", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "customers" }, JsonOptions), SortOrder = 45, IsActive = true },
                // Primary key targets for reference/lookup fields (enables linking to Customers/Sites in the UI).
                new FieldDefinitionEntity { Id = "field-customer-key", Name = "Customer Key", FieldType = "primary key", TablesJson = JsonSerializer.Serialize(new[] { "customers" }, JsonOptions), SortOrder = 46, IsActive = true },
                new FieldDefinitionEntity { Id = "field-site-key", Name = "Site Key", FieldType = "primary key", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 47, IsActive = true }
            });

        modelBuilder.Entity<InspectionImportEntity>()
            .HasIndex(i => i.ProjectId);

        modelBuilder.Entity<InspectionImportEntity>()
            .HasIndex(i => i.AssetId)
            .HasDatabaseName("IX_InspectionImports_ProjectAssetId");

        modelBuilder.Entity<InspectionImportEntity>()
            .HasIndex(i => i.ContentHash)
            .HasDatabaseName("IX_InspectionImports_Hash");

        modelBuilder.Entity<InspectionImportEntity>()
            .HasIndex(i => i.Status);
    }
}
