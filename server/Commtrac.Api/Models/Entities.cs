using System.ComponentModel.DataAnnotations;

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

public class ProductEntity
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    [MaxLength(500)]
    public string? Description { get; set; }
    public string FeaturesJson { get; set; } = "[]";
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
    [MaxLength(800)]
    public string Description { get; set; } = string.Empty;
    [MaxLength(40)]
    public string StartDate { get; set; } = string.Empty;
    [MaxLength(40)]
    public string FinishDate { get; set; } = string.Empty;
    [MaxLength(40)]
    public string Office { get; set; } = "Atlanta, United States";
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
    [MaxLength(100)]
    public string? ProductConfigId { get; set; }
    [MaxLength(100)]
    public string? WorkflowTemplateId { get; set; }
    [MaxLength(200)]
    public string AssetTag { get; set; } = string.Empty;
    [MaxLength(200)]
    public string? SerialNumber { get; set; }
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
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
