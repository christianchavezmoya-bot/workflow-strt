using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Commtrac.Api.Models;

public class UserEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(200)]
    public string Email { get; set; } = string.Empty;
    [MaxLength(200)]
    public string FullName { get; set; } = string.Empty;
    [MaxLength(80)]
    public string Role { get; set; } = "Viewer";
    [MaxLength(40)]
    public string Office { get; set; } = "Atlanta, United States";
    public bool IsActive { get; set; } = true;
    public bool IsFirstLogin { get; set; } = true;
    [MaxLength(200)]
    public string PasswordHash { get; set; } = string.Empty;
    [MaxLength(200)]
    public string? ResetToken { get; set; }
    public DateTime? ResetTokenExpiresUtc { get; set; }
    public DateTime? PasswordChangedAt { get; set; }
    public bool Is2faEnabled { get; set; }
    [MaxLength(200)]
    public string? TotpSecret { get; set; }
    public string? RecoveryCodesJson { get; set; }
}

public class CustomerEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(80)]
    public string CustomerId { get; set; } = string.Empty;
    [MaxLength(40)]
    public string Office { get; set; } = "All";
    [MaxLength(100)]
    public string? Industry { get; set; }
    [MaxLength(1000)]
    public string? Logo { get; set; }
    [MaxLength(40)]
    public string LogoShape { get; set; } = "round";
    public int PhotoScale { get; set; } = 100;
    public int LogoSize { get; set; } = 70;
}

public class SiteEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string CustomerId { get; set; } = string.Empty;
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(500)]
    public string? Address { get; set; }
    [MaxLength(100)]
    public string? City { get; set; }
    [MaxLength(40)]
    public string? State { get; set; }
    [MaxLength(100)]
    public string? Country { get; set; }
    [MaxLength(20)]
    public string? ZipCode { get; set; }
    [MaxLength(200)]
    public string? ContactName { get; set; }
    [MaxLength(80)]
    public string? ContactPhone { get; set; }
    [MaxLength(200)]
    public string? ContactEmail { get; set; }
    [MaxLength(800)]
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class DivisionEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(500)]
    public string? Description { get; set; }
    public int SortOrder { get; set; } = 99;
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// Global feature definition — reusable across products.
/// IDs are preserved from existing FeaturesJson to keep workflow step references intact.
/// </summary>
public class FeatureEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(500)]
    public string? Description { get; set; }
    /// <summary>ValueType: text, number, single-select, multi-select, component, etc.</summary>
    [MaxLength(80)]
    public string ValueType { get; set; } = "text";
    /// <summary>JSON array of option strings for select-type features.</summary>
    public string OptionsJson { get; set; } = "[]";
    /// <summary>JSON array of FeatureSubPropertyDto for component/inventory features.</summary>
    public string SubPropertiesJson { get; set; } = "[]";
    /// <summary>true = this feature is itself a tracked inventory item (captures serial/IP/MAC/etc.)</summary>
    public bool IsInventory { get; set; } = false;
    /// <summary>Inventory only: JSON array of capture field names e.g. ["serialNo","firmware","ipAddress"]</summary>
    public string CaptureFieldsJson { get; set; } = "[]";
    /// <summary>Procurement: brand name e.g. "Hikvision"</summary>
    [MaxLength(200)]
    public string? Brand { get; set; }
    /// <summary>Procurement: supplier or manufacturer name</summary>
    [MaxLength(200)]
    public string? Supplier { get; set; }
    /// <summary>Procurement: alternative / substitute part number</summary>
    [MaxLength(200)]
    public string? AlternativePartNumber { get; set; }
    /// <summary>Procurement: manufacturer's own part number</summary>
    [MaxLength(200)]
    public string? ManufacturerPartNumber { get; set; }
    /// <summary>Procurement: unit price (cost per unit)</summary>
    public decimal? UnitPrice { get; set; }
    /// <summary>Procurement: URL to product page, datasheet, or supplier listing</summary>
    [MaxLength(1000)]
    public string? ProductLink { get; set; }
}

/// <summary>
/// A physical dependency of a Feature — either inventory (serialized per unit)
/// or non-inventory (quantity + unit + price).
/// </summary>
public class FeatureDependencyEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string FeatureId { get; set; } = string.Empty;
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    /// <summary>true = inventory (tracked serial/IP/MAC/firmware), false = non-inventory (qty+price)</summary>
    public bool IsInventory { get; set; } = false;
    /// <summary>Inventory only: JSON array of capture field names e.g. ["serialNo","firmware","ipAddress","macAddress"]</summary>
    public string CaptureFieldsJson { get; set; } = "[]";
    /// <summary>Non-inventory only: default quantity pre-filled in BOM.</summary>
    public decimal DefaultQty { get; set; } = 1;
    /// <summary>Non-inventory only: unit label e.g. "m", "pcs", "kg".</summary>
    [MaxLength(40)]
    public string? Unit { get; set; }
    /// <summary>Non-inventory only: default unit price.</summary>
    public decimal UnitPrice { get; set; } = 0;
    public int SortOrder { get; set; } = 0;
}

/// <summary>Many-to-many join: Product ↔ Feature.</summary>
public class ProductFeatureEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string ProductId { get; set; } = string.Empty;
    [MaxLength(80)]
    public string FeatureId { get; set; } = string.Empty;
    public int SortOrder { get; set; } = 0;
}

public class ProductEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(500)]
    public string? Description { get; set; }
    public string FeaturesJson { get; set; } = "[]";
    [MaxLength(80)]
    public string? DivisionId { get; set; }
}

public class AssetEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public int Seq { get; set; }
    [MaxLength(200)]
    public string MachineType { get; set; } = string.Empty;
    [MaxLength(200)]
    public string MachineId { get; set; } = string.Empty;
    [MaxLength(200)]
    public string SerialNumber { get; set; } = string.Empty;
    [MaxLength(80)]
    public string PmCount { get; set; } = string.Empty;
    [MaxLength(800)]
    public string Comments { get; set; } = string.Empty;
}

public class ProjectEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(200)]
    public string CustomerName { get; set; } = string.Empty;
    [MaxLength(80)]
    public string CustomerId { get; set; } = string.Empty;
    [MaxLength(80)]
    public string? SiteId { get; set; }
    [MaxLength(80)]
    public string JobNumber { get; set; } = string.Empty;
    [MaxLength(80)]
    public string PurchaseOrderNumber { get; set; } = string.Empty;
    [MaxLength(800)]
    public string Description { get; set; } = string.Empty;
    [MaxLength(40)]
    public string StartDate { get; set; } = string.Empty;
    [MaxLength(40)]
    public string FinishDate { get; set; } = string.Empty;
    [MaxLength(40)]
    public string Office { get; set; } = "Atlanta, United States";
    [MaxLength(80)]
    public string? OfficeId { get; set; }
    [MaxLength(120)]
    public string? Region { get; set; }
    [MaxLength(40)]
    public string ProjectType { get; set; } = "Internal";
    [MaxLength(40)]
    public string Status { get; set; } = "Draft";
    [MaxLength(80)]
    public string? ApprovalDecision { get; set; }
    public bool IsInstallationProject { get; set; }
    [MaxLength(80)]
    public string? InstallationMode { get; set; }
    /// <summary>
    /// INSTALLATION_ONLY | INSPECTION_ONLY | MIXED.
    /// Null means legacy row — treated as INSTALLATION_ONLY when IsInstallationProject=true, else INSPECTION_ONLY.
    /// </summary>
    [MaxLength(40)]
    public string? WorkflowMode { get; set; }
    [MaxLength(200)]
    public string? ProjectManager { get; set; }
    public decimal? ContractValue { get; set; }
    [MaxLength(120)]
    public string? ProbabilityStage { get; set; }
    public List<string> ProductIds { get; set; } = new();
    public string ProductFeatureValuesJson { get; set; } = "{}";
}

public class InstallationEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string ProjectId { get; set; } = string.Empty;
    [MaxLength(80)]
    public string InstallationNumber { get; set; } = string.Empty;
    [MaxLength(80)]
    public string? InstallationId { get; set; }
    [MaxLength(200)]
    public string? InstallationName { get; set; }
    [MaxLength(200)]
    public string SiteLocation { get; set; } = string.Empty;
    [MaxLength(200)]
    public string? SiteContactName { get; set; }
    [MaxLength(80)]
    public string? SiteContactPhone { get; set; }
    [MaxLength(200)]
    public string? SiteContactEmail { get; set; }
    [MaxLength(40)]
    public string ScheduledStart { get; set; } = string.Empty;
    [MaxLength(40)]
    public string ScheduledEnd { get; set; } = string.Empty;
    [MaxLength(40)]
    public string? ActualStart { get; set; }
    [MaxLength(40)]
    public string? ActualFinish { get; set; }
    [MaxLength(40)]
    public string Status { get; set; } = "Not Started";
    [MaxLength(200)]
    public string AssignedTeam { get; set; } = string.Empty;
    public List<string> AssignedUsers { get; set; } = new();
    [MaxLength(40)]
    public string Office { get; set; } = "Atlanta, United States";
    [MaxLength(800)]
    public string? InstallerNotes { get; set; }
    [MaxLength(40)]
    public string? CustomerSignOffDate { get; set; }
    [MaxLength(200)]
    public string? CustomerSignOffContact { get; set; }
    [MaxLength(200)]
    public string? MachineType { get; set; }
    [MaxLength(200)]
    public string? Pm1Serial { get; set; }
    [MaxLength(200)]
    public string? Pm2Serial { get; set; }
    [MaxLength(200)]
    public string? Pm3Serial { get; set; }
    [MaxLength(200)]
    public string? Pm4Serial { get; set; }
    public string CustomFieldsJson { get; set; } = "{}";
}

public class CustomFieldDefinitionEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(40)]
    public string FieldType { get; set; } = "text";
    [MaxLength(40)]
    public string Scope { get; set; } = "installation";
    [MaxLength(200)]
    public string? Product { get; set; }
    public int SortOrder { get; set; }
    public string OptionsJson { get; set; } = "[]";
    public bool IsActive { get; set; } = true;
}

public class InspectionEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string InstallationId { get; set; } = string.Empty;
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(200)]
    public string Inspector { get; set; } = string.Empty;
    [MaxLength(40)]
    public string Status { get; set; } = "Scheduled";
    public int PhotoCount { get; set; } = 0;
    [MaxLength(40)]
    public string? ScheduledDate { get; set; }
}

public class IssueEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string InstallationId { get; set; } = string.Empty;
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;
    [MaxLength(40)]
    public string Status { get; set; } = "Open";
    [MaxLength(40)]
    public string Priority { get; set; } = "Medium";
    [MaxLength(200)]
    public string Owner { get; set; } = "Unassigned";
    [MaxLength(800)]
    public string? Description { get; set; }
}

public class DocumentEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(80)]
    public string Type { get; set; } = string.Empty;
    [MaxLength(200)]
    public string LinkedTo { get; set; } = string.Empty;
    [MaxLength(40)]
    public string UploadedAt { get; set; } = string.Empty;
    [MaxLength(400)]
    public string? FilePath { get; set; }
    [MaxLength(120)]
    public string? ContentType { get; set; }
    public long? FileSize { get; set; }
    [MaxLength(200)]
    public string? CreatedBy { get; set; }
    [MaxLength(2000)]
    public string? Notes { get; set; }
    public string? CustomValuesJson { get; set; }
    [MaxLength(2000)]
    public string? DownloadUrl { get; set; }
}

public class DocumentConfigEntity
{
    [Key]
    public int Id { get; set; } = 1;
    public string TabsJson { get; set; } = "[]";
    public string FieldsJson { get; set; } = "[]";
}

public class InspectionPhotoEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string InspectionId { get; set; } = string.Empty;
    [MaxLength(200)]
    public string FileName { get; set; } = string.Empty;
    [MaxLength(400)]
    public string FilePath { get; set; } = string.Empty;
    [MaxLength(120)]
    public string? ContentType { get; set; }
    public long? FileSize { get; set; }
    [MaxLength(40)]
    public string UploadedAt { get; set; } = string.Empty;
}

public class FieldDefinitionEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(120)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(40)]
    public string FieldType { get; set; } = "text";
    [MaxLength(120)]
    public string? LinkToFieldId { get; set; }
    [MaxLength(80)]
    public string? ActionType { get; set; }
    [MaxLength(400)]
    public string TablesJson { get; set; } = "[]";
    public int SortOrder { get; set; } = 0;
    public bool IsActive { get; set; } = true;
}

public class FieldValueEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string FieldDefinitionId { get; set; } = string.Empty;
    [MaxLength(40)]
    public string TableName { get; set; } = string.Empty;
    [MaxLength(80)]
    public string EntityId { get; set; } = string.Empty;
    [MaxLength(2000)]
    public string Value { get; set; } = string.Empty;
    [MaxLength(40)]
    public string UpdatedAt { get; set; } = string.Empty;
}

public class AdminTabEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(120)]
    public string Label { get; set; } = string.Empty;
    [MaxLength(40)]
    public string Type { get; set; } = string.Empty;
    [MaxLength(120)]
    public string? PrimaryActionLabel { get; set; }
    public int Position { get; set; }
    public string ColumnsJson { get; set; } = "[]";
    public string FieldIdsJson { get; set; } = "[]";
    public string ConfigJson { get; set; } = "{\"order\":[],\"hidden\":[]}";
}

public class AdminTabRowEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string TabId { get; set; } = string.Empty;
    public string DataJson { get; set; } = "{}";
    public int Position { get; set; }
}

public class InstallationTabEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(120)]
    public string Label { get; set; } = string.Empty;
    [MaxLength(40)]
    public string Type { get; set; } = string.Empty;
    public int Position { get; set; }
}

public class InstallationTabRowEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string TabId { get; set; } = string.Empty;
    public string DataJson { get; set; } = "{}";
    public int Position { get; set; }
}

public class RoleConfigEntity
{
    [Key]
    public int Id { get; set; } = 1;
    public string ConfigJson { get; set; } = "{}";
}

public class QuickbaseSettingsEntity
{
    [Key]
    public int Id { get; set; } = 1;
    public bool Enabled { get; set; }
    [MaxLength(200)]
    public string RealmHostname { get; set; } = string.Empty;
    [MaxLength(200)]
    public string UserToken { get; set; } = string.Empty;
    [MaxLength(80)]
    public string ProjectsTableId { get; set; } = string.Empty;
    [MaxLength(80)]
    public string InstallationsTableId { get; set; } = string.Empty;
    public string ProjectsFieldMapJson { get; set; } = "{}";
    public string InstallationsFieldMapJson { get; set; } = "{}";
    [MaxLength(80)]
    public string GoodsMovementsTableId { get; set; } = string.Empty;
    public int GoodsMovementsJobFid { get; set; }
    public int GoodsMovementsOrderRefFid { get; set; }
    public int GoodsMovementsDirectionFid { get; set; }
}

public class NotificationSettingsEntity
{
    [Key]
    public int Id { get; set; } = 1;

    [MaxLength(200)]
    public string SmtpHost { get; set; } = "";
    public int SmtpPort { get; set; } = 25;
    public bool SmtpUseSsl { get; set; }
    [MaxLength(200)]
    public string SmtpUser { get; set; } = "";
    [MaxLength(500)]
    public string SmtpPass { get; set; } = "";
    [MaxLength(200)]
    public string SmtpFrom { get; set; } = "no-reply@commtrac.local";
    [MaxLength(300)]
    public string FrontendBaseUrl { get; set; } = "http://localhost:5173";

    [MaxLength(80)]
    public string SmsProvider { get; set; } = "";
    [MaxLength(200)]
    public string SmsApiKey { get; set; } = "";
    [MaxLength(80)]
    public string SmsSender { get; set; } = "";
}

public class OfficeEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string Country { get; set; } = string.Empty;
    [MaxLength(100)]
    public string State { get; set; } = string.Empty;
    [MaxLength(100)]
    public string City { get; set; } = string.Empty;
    public double Lat { get; set; }
    public double Lng { get; set; }
}

public class AuditLogEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string UserId { get; set; } = string.Empty;
    [MaxLength(200)]
    public string UserEmail { get; set; } = string.Empty;
    [MaxLength(80)]
    public string Action { get; set; } = string.Empty;
    [MaxLength(500)]
    public string? Details { get; set; }
    [MaxLength(80)]
    public string? IpAddress { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class SessionEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string UserId { get; set; } = string.Empty;
    [MaxLength(200)]
    public string UserEmail { get; set; } = string.Empty;
    [MaxLength(80)]
    public string? IpAddress { get; set; }
    [MaxLength(500)]
    public string? UserAgent { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastActiveAt { get; set; } = DateTime.UtcNow;
    public bool IsRevoked { get; set; }
}

public class WorkflowTemplateEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(100)]
    public string ProductId { get; set; } = string.Empty;
    [MaxLength(100)]
    public string? WorkflowTypeId { get; set; }
    public string StepsJson { get; set; } = "[]";
    public string MediaJson { get; set; } = "[]";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class WorkInstructionEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string ProductId { get; set; } = string.Empty;
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;
    [MaxLength(800)]
    public string? Summary { get; set; }
    public string StepsJson { get; set; } = "[]";
    [MaxLength(20)]
    public string Status { get; set; } = "Draft";
    public string FeatureValuesJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class WorkOrderEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string WorkflowTemplateId { get; set; } = string.Empty;
    [MaxLength(100)]
    public string ProductId { get; set; } = string.Empty;
    [MaxLength(200)]
    public string JobReference { get; set; } = string.Empty;
    [MaxLength(20)]
    public string Status { get; set; } = "InProgress";
    public string StepsDataJson { get; set; } = "[]";
    [MaxLength(100)]
    public string? ProjectAssetId { get; set; }
    [MaxLength(1000)]
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class WorkInstructionTemplateEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(100)]
    public string ProductId { get; set; } = string.Empty;
    [MaxLength(20)]
    public string Status { get; set; } = "Draft";
    public string FeatureSelectionsJson { get; set; } = "[]";
    public string? Notes { get; set; }
    [MaxLength(100)]
    public string? WorkflowTemplateId { get; set; }
    [MaxLength(100)]
    public string? ConfigType { get; set; }
    [MaxLength(200)]
    public string? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class ProjectAssetEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string ProjectId { get; set; } = string.Empty;
    [MaxLength(100)]
    public string ProductId { get; set; } = string.Empty;
    // Deprecated: replaced by AssetWorkflowAssignmentEntity. Kept for migration safety.
    [MaxLength(100)]
    public string? ProductConfigId { get; set; }
    // Deprecated: replaced by AssetWorkflowAssignmentEntity. Kept for migration safety.
    [MaxLength(100)]
    public string? WorkflowTemplateId { get; set; }
    [MaxLength(200)]
    public string AssetTag { get; set; } = string.Empty;
    /// <summary>Equipment type/name e.g. "AGI-10", "Shuttle Car", "Skid Steer"</summary>
    [MaxLength(200)]
    public string? AssetName { get; set; }
    [MaxLength(200)]
    public string? SerialNumber { get; set; }
    [MaxLength(200)]
    public string? AssetModel { get; set; }
    [MaxLength(200)]
    public string? Manufacturer { get; set; }
    [MaxLength(200)]
    public string? Location { get; set; }
    [MaxLength(80)]
    public string? AssignedUserId { get; set; }
    [MaxLength(20)]
    public string Status { get; set; } = "NotStarted";
    [MaxLength(100)]
    public string? WorkOrderId { get; set; }
    [MaxLength(800)]
    public string? Notes { get; set; }
    public string FeatureValuesJson { get; set; } = "{}";
    public string IssuesJson { get; set; } = "[]";
    /// <summary>Human-readable label for what was installed, e.g. "Strata AI / 2 Cameras + Reverse Input"</summary>
    [MaxLength(400)]
    public string? ConfigLabel { get; set; }
    /// <summary>Timestamp when the installation workflow was completed</summary>
    public DateTime? InstalledAt { get; set; }
    /// <summary>Name of the technician who completed the installation</summary>
    [MaxLength(200)]
    public string? InstalledBy { get; set; }
    /// <summary>JSON snapshot of all captured data-capture field values from completed workflow runs (as-built document)</summary>
    public string AsBuiltJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// ─── Workflow Config Unification (v2 architecture) ────────────────────────────

/// <summary>
/// Unified workflow configuration — merges WorkInstructionTemplate + WorkflowTemplate.
/// Contains both the metadata (config type, feature selections) and the steps/media.
/// Status gates: Draft (editable) → Published (immutable, assignable) → Archived.
/// </summary>
public class WorkflowConfigEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string ProductId { get; set; } = string.Empty;
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(200)]
    public string? DisplayName { get; set; }
    [MaxLength(100)]
    public string? ConfigType { get; set; }
    [MaxLength(100)]
    public string? WorkflowTypeId { get; set; }
    /// <summary>Draft | Published | Archived</summary>
    [MaxLength(20)]
    public string Status { get; set; } = "Draft";
    public int Version { get; set; } = 1;
    /// <summary>ID of the WorkflowConfig this was cloned from (null if original)</summary>
    [MaxLength(100)]
    public string? TemplateSourceId { get; set; }
    public string StepsJson { get; set; } = "[]";
    public string MediaJson { get; set; } = "[]";
    public string FeatureSelectionsJson { get; set; } = "[]";
    public string? Notes { get; set; }
    [MaxLength(200)]
    public string? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Links a WorkflowConfig to a Feature with a quantity and per-dependency step inclusion flags.
/// InclusionsJson: { [dependencyId: string]: boolean } — true = generate a BOM step at publish.
/// </summary>
public class WorkflowConfigFeatureEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string WorkflowConfigId { get; set; } = string.Empty;
    [MaxLength(100)]
    public string FeatureId { get; set; } = string.Empty;
    /// <summary>Number of instances of this feature in this workflow (e.g. 3 cameras).</summary>
    public int Quantity { get; set; } = 1;
    /// <summary>JSON object: { [dependencyId]: bool } — whether each dep generates a step on Publish.</summary>
    public string InclusionsJson { get; set; } = "{}";
    public int SortOrder { get; set; } = 0;
}

/// <summary>
/// User-defined workflow execution types (Installation, Commissioning, Inspection, Repair…).
/// Seeded with 4 defaults; admins can add custom types.
/// </summary>
public class WorkflowTypeEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(50)]
    public string? Icon { get; set; }
    public int SortOrder { get; set; } = 0;
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// Planning layer — links a WorkflowConfig to a ProjectAsset for a given workflow type.
/// An asset can have multiple assignments (one per workflow type).
/// </summary>
public class AssetWorkflowAssignmentEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string AssetId { get; set; } = string.Empty;
    [MaxLength(100)]
    public string WorkflowConfigId { get; set; } = string.Empty;
    [MaxLength(100)]
    public string WorkflowTypeId { get; set; } = string.Empty;
    public bool Active { get; set; } = true;
    [MaxLength(200)]
    public string? AssignedBy { get; set; }
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Execution instance — one record per time a workflow is run against an asset.
/// WorkflowSnapshotJson is a frozen copy of the config at the moment the run started.
/// IsLocked=true after completion; locked runs are read-only.
/// </summary>
public class AssetWorkflowRunEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string AssetId { get; set; } = string.Empty;
    [MaxLength(100)]
    public string WorkflowConfigId { get; set; } = string.Empty;
    public int WorkflowVersion { get; set; } = 1;
    /// <summary>Frozen snapshot of the workflow config at run start. Immutable once set.</summary>
    public string WorkflowSnapshotJson { get; set; } = "{}";
    /// <summary>Legacy link to WorkOrder (for historical runs migrated from old schema)</summary>
    [MaxLength(100)]
    public string? WorkOrderId { get; set; }
    /// <summary>InProgress | Complete | Issue</summary>
    [MaxLength(20)]
    public string Status { get; set; } = "InProgress";
    /// <summary>Once locked, StepResultsJson and IssuesJson cannot be modified.</summary>
    public bool IsLocked { get; set; } = false;
    [MaxLength(80)]
    public string? TechnicianUserId { get; set; }
    public string StepResultsJson { get; set; } = "[]";
    public string IssuesJson { get; set; } = "[]";
    /// <summary>
    /// JSON array of time entries:
    /// [{ id, category: productive|downtime, startedAtUtc, endedAtUtc, reason }]
    /// </summary>
    public string TimeTrackingJson { get; set; } = "[]";
    /// <summary>Total productive seconds across closed time entries.</summary>
    public int ProductiveSeconds { get; set; } = 0;
    /// <summary>Total downtime seconds across closed time entries.</summary>
    public int DowntimeSeconds { get; set; } = 0;
    /// <summary>Count of downtime periods recorded for this run.</summary>
    public int DowntimeEvents { get; set; } = 0;
    /// <summary>Sequential run number per asset+config (1 = first run, 2 = first re-run, …)</summary>
    public int RunNumber { get; set; } = 1;
    /// <summary>Full name of the user who locked/completed the run.</summary>
    [MaxLength(200)]
    public string? CompletedByName { get; set; }
    /// <summary>None | PendingInstaller | PendingCustomer | Signed | Declined</summary>
    [MaxLength(40)]
    public string SignatureStatus { get; set; } = "None";
    public DateTime? InstallerSignedAt { get; set; }
    public DateTime? CustomerSignedAt { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    /// <summary>JSON array of confirmed BOM items (BomActualItem[]) recorded at run completion.</summary>
    public string BomActualJson { get; set; } = "[]";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Simple key-value store for brand/global settings (e.g. business logo).</summary>
public class BrandSettingEntity
{
    [Key]
    [MaxLength(80)]
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// ─── Asset Documents ──────────────────────────────────────────────────────────
// One AssetDocumentEntity = one document slot per asset (max 3 per asset).
// Each upload/replace appends a new AssetDocumentRevisionEntity child record.

public class AssetDocumentEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string AssetId { get; set; } = string.Empty;
    [MaxLength(100)]
    public string Label { get; set; } = "Document";   // Drawing | BOM | Agreement | Datasheet | Other
    [MaxLength(200)]
    public string? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class AssetDocumentRevisionEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string DocumentId { get; set; } = string.Empty;
    public int RevisionNumber { get; set; } = 1;
    [MaxLength(260)]
    public string OriginalName { get; set; } = string.Empty;
    [MaxLength(260)]
    public string StoredName { get; set; } = string.Empty;   // "{revId}_{safeOriginalName}"
    [MaxLength(120)]
    public string MimeType { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    [MaxLength(200)]
    public string? UploadedBy { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
}

// ─── Asset Document Links ──────────────────────────────────────────────────────
// Bridge table: references from an asset to a library document (max 3 per asset).
// The DocumentEntity in the global library is the source of truth; this link is
// just a reference. Detaching a link does NOT delete the library document.

public class AssetDocumentLinkEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string AssetId { get; set; } = string.Empty;
    [MaxLength(100)]
    public string DocumentId { get; set; } = string.Empty;
    [MaxLength(200)]
    public string? AttachedBy { get; set; }
    public DateTime AttachedAt { get; set; } = DateTime.UtcNow;
}

// ─── Project CRM — Contacts, Delivery Profiles, Inbound Items ─────────────────

public class ProjectContactEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string ProjectId { get; set; } = string.Empty;
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(100)]
    public string? Title { get; set; }
    [MaxLength(200)]
    public string? Email { get; set; }
    [MaxLength(80)]
    public string? Phone { get; set; }
    /// <summary>email | sms</summary>
    [MaxLength(40)]
    public string PreferredSignMethod { get; set; } = "email";
    public bool IsPrimarySigner { get; set; }
    public bool CcReports { get; set; }
    public string? Address { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class ProjectDeliveryProfileEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string ProjectId { get; set; } = string.Empty;
    /// <summary>e.g. "Main Site", "Warehouse"</summary>
    [MaxLength(100)]
    public string Label { get; set; } = string.Empty;
    [MaxLength(200)]
    public string? ContactName { get; set; }
    [MaxLength(80)]
    public string? ContactPhone { get; set; }
    [MaxLength(200)]
    public string? ContactEmail { get; set; }
    [MaxLength(500)]
    public string? AddressLine1 { get; set; }
    [MaxLength(200)]
    public string? AddressLine2 { get; set; }
    [MaxLength(100)]
    public string? City { get; set; }
    [MaxLength(80)]
    public string? State { get; set; }
    [MaxLength(20)]
    public string? PostCode { get; set; }
    [MaxLength(100)]
    public string? Country { get; set; }
    [MaxLength(800)]
    public string? DeliveryNotes { get; set; }
    [MaxLength(200)]
    public string? AccessHours { get; set; }
    public bool IsDefault { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class ProjectInboundItemEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string ProjectId { get; set; } = string.Empty;
    [MaxLength(400)]
    public string Description { get; set; } = string.Empty;
    public decimal Quantity { get; set; } = 1;
    [MaxLength(40)]
    public string? Unit { get; set; }
    /// <summary>Good | Damaged | Needs Assessment</summary>
    [MaxLength(40)]
    public string Condition { get; set; } = "Good";
    /// <summary>PO#, warranty ref, RMA#, etc.</summary>
    [MaxLength(200)]
    public string? ReferenceNumber { get; set; }
    [MaxLength(40)]
    public string? ReceivedDate { get; set; }
    [MaxLength(200)]
    public string? ReceivedBy { get; set; }
    [MaxLength(800)]
    public string? Notes { get; set; }
    /// <summary>Part | Warranty | Return | Other</summary>
    [MaxLength(40)]
    public string ItemType { get; set; } = "Part";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// ─── Dual-Signature Events (append-only audit) ────────────────────────────────

public class SignatureEventEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string RunId { get; set; } = string.Empty;
    [MaxLength(40)]
    public string SignerRole { get; set; } = string.Empty;
    [MaxLength(200)]
    public string SignerName { get; set; } = string.Empty;
    [MaxLength(200)]
    public string? SignerEmail { get; set; }
    [MaxLength(100)]
    public string? SignerTitle { get; set; }
    public DateTime SignedAtUtc { get; set; } = DateTime.UtcNow;
    public string? SignatureData { get; set; }
    [MaxLength(400)]
    public string? DeviceInfo { get; set; }
    [MaxLength(60)]
    public string? IpAddress { get; set; }
    [MaxLength(40)]
    public string ReasonCode { get; set; } = "Completed";
    [MaxLength(2000)]
    public string? Notes { get; set; }
    [MaxLength(100)]
    public string? TokenId { get; set; }
}

// ─── Signature Tokens (external Review & Sign links) ──────────────────────────

public class SignatureTokenEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string RunId { get; set; } = string.Empty;
    [MaxLength(100)]
    public string? ContactId { get; set; }
    [MaxLength(200)]
    public string RecipientEmail { get; set; } = string.Empty;
    [MaxLength(200)]
    public string? RecipientName { get; set; }
    [MaxLength(100)]
    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? UsedAtUtc { get; set; }
    public bool IsRevoked { get; set; }
    [MaxLength(200)]
    public string? OtpHash { get; set; }
    public DateTime? OtpExpiresAtUtc { get; set; }
}

// ─── Dispatch / Logistics ──────────────────────────────────────────────────────

public class DispatchOrderEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(80)]
    public string ProjectId { get; set; } = string.Empty;
    [MaxLength(80)]
    public string? DeliveryProfileId { get; set; }
    [MaxLength(200)]
    public string? RequestedByName { get; set; }
    [MaxLength(40)]
    public string? NeededByDate { get; set; }
    [MaxLength(40)]
    public string Priority { get; set; } = "Normal";
    [MaxLength(40)]
    public string Status { get; set; } = "Draft";
    [MaxLength(200)]
    public string? Carrier { get; set; }
    [MaxLength(200)]
    public string? TrackingNumber { get; set; }
    [MaxLength(500)]
    public string? TrackingUrl { get; set; }
    [MaxLength(800)]
    public string? InternalNotes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class DispatchLineEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string OrderId { get; set; } = string.Empty;
    [MaxLength(400)]
    public string Description { get; set; } = string.Empty;
    [MaxLength(100)]
    public string? PartNumber { get; set; }
    public decimal QuantityRequested { get; set; } = 1;
    public decimal QuantityShipped { get; set; } = 0;
    [MaxLength(40)]
    public string? Unit { get; set; }
    public decimal? UnitCost { get; set; }
    public bool IsBillable { get; set; } = true;
    [MaxLength(100)]
    public string? TaxCode { get; set; }
    [MaxLength(400)]
    public string? Notes { get; set; }
}

public class DeliveryEventEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(100)]
    public string OrderId { get; set; } = string.Empty;
    [MaxLength(40)]
    public string EventType { get; set; } = string.Empty;
    public DateTime OccurredAtUtc { get; set; } = DateTime.UtcNow;
    [MaxLength(200)]
    public string? Location { get; set; }
    [MaxLength(1000)]
    public string? Notes { get; set; }
    [MaxLength(200)]
    public string? RecordedBy { get; set; }
}

// ─── BOM-to-Project Module (removable — additive only) ───────────────────────

public class BomImportRunEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(500)]
    public string FileName { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(200)]
    public string UploadedBy { get; set; } = string.Empty;
    [MaxLength(40)]
    public string Status { get; set; } = "uploading";
    [MaxLength(500)]
    public string? StatusMessage { get; set; }
    public string SheetNamesJson { get; set; } = "[]";
    public string SelectedSheetsJson { get; set; } = "[]";
    [MaxLength(100)]
    public string? MappingProfileId { get; set; }
    [MaxLength(100)]
    public string? RuleProfileId { get; set; }
    public int TotalRawRows { get; set; }
    public int NormalizedRows { get; set; }
    public int ClassifiedRows { get; set; }
    public int ValidationErrors { get; set; }
    public int ValidationWarnings { get; set; }
    [MaxLength(100)]
    public string? PublishedProjectId { get; set; }
    [MaxLength(1000)]
    public string? Notes { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    // Staging data stored as JSON blobs for isolation
    public string? RawRowsJson { get; set; }
    public string? NormalizedRowsJson { get; set; }
    public string? ClassificationsJson { get; set; }
    public string? MappingsJson { get; set; }
    public string? DraftProjectJson { get; set; }
    public string? ValidationResultJson { get; set; }
    public string? CommitLogsJson { get; set; }
}

public class BomMappingProfileEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    public string MappingsJson { get; set; } = "[]";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(200)]
    public string? CreatedBy { get; set; }
}

public class BomRuleProfileEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    public string RulesJson { get; set; } = "[]";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(200)]
    public string? CreatedBy { get; set; }
}

// ─── Inspection Imports (third-party JSON inbox) ──────────────────────────────

/// <summary>
/// Stores raw inspection JSON payloads received from external sources
/// (OneDrive, local upload, email). An import stays raw until a user
/// assigns it to a project + asset, at which point status moves to MAPPED.
/// </summary>
public class InspectionImportEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>ONEDRIVE | LOCAL | EMAIL | API</summary>
    [MaxLength(40)]
    public string Source { get; set; } = "LOCAL";

    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;

    [NotMapped]
    public string? FileName { get; set; }

    /// <summary>SHA-256 of raw content for deduplication.</summary>
    [Column("Hash")]
    [MaxLength(64)]
    public string? ContentHash { get; set; }

    /// <summary>Raw JSON body (stored inline for MVP; large files should use RawPath).</summary>
    public string? RawJson { get; set; }

    /// <summary>Optional path to file on disk for payloads too large for inline storage.</summary>
    [NotMapped]
    public string? RawPath { get; set; }

    /// <summary>Nullable until assigned by a user.</summary>
    [MaxLength(100)]
    public string? ProjectId { get; set; }

    /// <summary>Nullable until assigned by a user.</summary>
    [Column("ProjectAssetId")]
    [MaxLength(100)]
    public string? AssetId { get; set; }

    /// <summary>RECEIVED | NEEDS_ASSIGNMENT | MAPPED | FAILED</summary>
    [MaxLength(40)]
    public string Status { get; set; } = "RECEIVED";

    [Column("Error")]
    [MaxLength(2000)]
    public string? ErrorText { get; set; }

    /// <summary>Set once the import is mapped to an AssetWorkflowRun.</summary>
    [MaxLength(100)]
    public string? MappedRunId { get; set; }

    [NotMapped]
    public string? UploadedBy { get; set; }
}
