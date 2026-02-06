namespace Commtrac.Api.Models;

public record LoginRequest(string Email, string Password);

public record LoginResponse(string Token, UserDto User, bool IsFirstLogin);

public record ForgotPasswordRequest(string Email);

public record ResetPasswordRequest(string Token, string NewPassword);

public record UpdateProfileRequest(string FullName, string Office);

public record UserDto(
    string Id,
    string Email,
    string FullName,
    string Role,
    string Office,
    bool IsActive,
    bool IsFirstLogin
);

public record CreateUserRequest(
    string FullName,
    string Email,
    string Role,
    string Office
);

public record UpdateUserRequest(
    string? FullName,
    string? Email,
    string? Role,
    string? Office,
    bool? IsActive,
    bool? IsFirstLogin,
    string? Password
);

public record CustomerDto(
    string Id,
    string Name,
    string CustomerId,
    string Office,
    string? Industry,
    string? Logo,
    string LogoShape,
    int PhotoScale,
    int LogoSize
);

public record CreateCustomerRequest(
    string Name,
    string CustomerId,
    string Office,
    string? Industry,
    string? Logo,
    string? LogoShape,
    int? PhotoScale,
    int? LogoSize
);

public record UpdateCustomerRequest(
    string? Name,
    string? CustomerId,
    string? Office,
    string? Industry,
    string? Logo,
    string? LogoShape,
    int? PhotoScale,
    int? LogoSize
);

public record SiteDto(
    string Id,
    string CustomerId,
    string Name,
    string? Address,
    string? City,
    string? State,
    string? ZipCode,
    string? ContactName,
    string? ContactPhone,
    string? ContactEmail,
    string? Notes,
    DateTime CreatedAt
);

public record CreateSiteRequest(
    string CustomerId,
    string Name,
    string? Address,
    string? City,
    string? State,
    string? ZipCode,
    string? ContactName,
    string? ContactPhone,
    string? ContactEmail,
    string? Notes
);

public record UpdateSiteRequest(
    string? Name,
    string? Address,
    string? City,
    string? State,
    string? ZipCode,
    string? ContactName,
    string? ContactPhone,
    string? ContactEmail,
    string? Notes
);

public record ProductDto(
    string Id,
    string Name,
    string? Description
);

public record CreateProductRequest(
    string Name,
    string? Description
);

public record UpdateProductRequest(
    string? Name,
    string? Description
);

public record AssetDto(
    string Id,
    int Seq,
    string MachineType,
    string MachineId,
    string SerialNumber,
    string PmCount,
    string Comments
);

public record CreateAssetRequest(
    string MachineType,
    string MachineId,
    string SerialNumber,
    string PmCount,
    string Comments
);

public record UpdateAssetRequest(
    string? MachineType,
    string? MachineId,
    string? SerialNumber,
    string? PmCount,
    string? Comments
);

public record ProjectDto(
    string Id,
    string CustomerName,
    string CustomerId,
    string JobNumber,
    string Description,
    string StartDate,
    string FinishDate,
    string Office,
    string? Region,
    string ProjectType,
    string Status,
    string? ApprovalDecision,
    bool IsInstallationProject,
    string? InstallationMode,
    string? ProjectManager,
    decimal? ContractValue,
    string? ProbabilityStage,
    List<string>? ProductIds
);

public record UpdateProjectStatusRequest(
    string Status,
    string? ApprovalDecision
);

public record InstallationDto(
    string Id,
    string ProjectId,
    string InstallationNumber,
    string? InstallationId,
    string? InstallationName,
    string SiteLocation,
    string? SiteContactName,
    string? SiteContactPhone,
    string? SiteContactEmail,
    string ScheduledStart,
    string ScheduledEnd,
    string? ActualStart,
    string? ActualFinish,
    string Status,
    string AssignedTeam,
    List<string>? AssignedUsers,
    string Office,
    string? InstallerNotes,
    string? CustomerSignOffDate,
    string? CustomerSignOffContact,
    string? MachineType,
    string? Pm1Serial,
    string? Pm2Serial,
    string? Pm3Serial,
    string? Pm4Serial,
    Dictionary<string, string>? CustomFields
);

public record QuickbaseSettingsDto(
    bool Enabled,
    string RealmHostname,
    string UserToken,
    string ProjectsTableId,
    string InstallationsTableId,
    Dictionary<string, int> ProjectsFieldMap,
    Dictionary<string, int> InstallationsFieldMap
);

public record InspectionDto(
    string Id,
    string InstallationId,
    string Name,
    string Inspector,
    string Status,
    int PhotoCount,
    string? ScheduledDate
);

public record IssueDto(
    string Id,
    string InstallationId,
    string Title,
    string Status,
    string Priority,
    string Owner,
    string? Description
);

public record FieldDefinitionDto(
    string Id,
    string Name,
    string FieldType,
    string? LinkToFieldId,
    string? ActionType,
    List<string> Tables,
    int SortOrder,
    bool IsActive
);

public record FieldValueDto(
    string Id,
    string FieldDefinitionId,
    string TableName,
    string EntityId,
    string Value,
    string UpdatedAt
);

public record TableConfigDto(
    List<string> Order,
    List<string> Hidden
);

public record AdminTabDto(
    string Id,
    string Label,
    string Type,
    int Position,
    List<string> Columns,
    List<string> FieldIds,
    TableConfigDto Config,
    string? PrimaryActionLabel
);

public record AdminTabRowDto(
    string Id,
    string TabId,
    Dictionary<string, string> Data,
    int Position
);

public record GlobalTableConfigDto(
    string TableName,
    List<string> Order,
    List<string> Hidden,
    Dictionary<string, string> BaseFieldNames
);

public record InstallationTabDto(
    string Id,
    string Label,
    string Type,
    int Position
);

public record InstallationTabRowDto(
    string Id,
    string TabId,
    Dictionary<string, string> Data,
    int Position
);

public record DocumentDto(
    string Id,
    string Name,
    string Type,
    string LinkedTo,
    string UploadedAt,
    string? ContentType,
    long? FileSize,
    string? DownloadUrl
);

public record InspectionPhotoDto(
    string Id,
    string InspectionId,
    string FileName,
    string UploadedAt,
    string? ContentType,
    long? FileSize,
    string? DownloadUrl
);

public record CustomFieldDefinitionDto(
    string Id,
    string Name,
    string FieldType,
    string Scope,
    string? Product,
    int SortOrder,
    List<string> Options,
    bool IsActive
);

public record RolePermissions(
    bool ViewOnly,
    bool CreateDeleteTables,
    bool CreateUsers,
    bool EditFields,
    bool ModifyData,
    bool EditForms
);

public record RoleConfigDto(
    Dictionary<string, RolePermissions> Roles
);
