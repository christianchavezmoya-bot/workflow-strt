namespace Commtrac.Api.Models;

public record LoginRequest(string Email, string Password, string? TrustedDeviceToken = null);

public record LoginResponse(string? Token, UserDto? User, bool IsFirstLogin, bool Requires2fa = false, string? TwoFactorToken = null, string? TrustedDeviceToken = null, bool PasswordExpired = false);

public record ForgotPasswordRequest(string Email);

public record ResetPasswordRequest(string Token, string NewPassword);

public record UpdateProfileRequest(string FullName, string Office);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

// 2FA DTOs
public record TwoFactorLoginRequest(string TwoFactorToken, string Code, bool RememberDevice = false);
public record TwoFactorSetupResponse(string Secret, string QrCodeUri);
public record TwoFactorVerifyRequest(string Code);
public record TwoFactorDisableRequest(string Password);
public record TwoFactorRecoveryRequest(string TwoFactorToken, string RecoveryCode, bool RememberDevice = false);
public record TwoFactorRegenerateRequest(string Password);
public record RecoveryCodesResponse(List<string> Codes);

public record NotificationSettingsDto(
    string SmtpHost,
    int SmtpPort,
    bool SmtpUseSsl,
    string SmtpUser,
    string SmtpPass,
    string SmtpFrom,
    string FrontendBaseUrl,
    string SmsProvider,
    string SmsApiKey,
    string SmsSender
);

public record TestEmailRequest(string ToEmail);

public record TestEmailResponse(bool Sent, string Mode, string Message);

public record PublicAppSettingsDto(
    string FrontendBaseUrl
);

public record NotificationInboxDto(
    string Id,
    string EventType,
    string Severity,
    string Title,
    string Message,
    string? ProjectId,
    string? AssetId,
    string? RunId,
    string? EntityType,
    string? EntityId,
    string? TriggeredByUserId,
    string? TriggeredByName,
    DateTime CreatedAtUtc,
    DateTime? ReadAtUtc,
    bool IsRead
);

public record CreateNotificationRequest(
    string EventType,
    string Severity,
    string Title,
    string Message,
    List<string>? RecipientUserIds,
    List<string>? RecipientRoles,
    string? ProjectId,
    string? AssetId,
    string? RunId,
    string? EntityType,
    string? EntityId,
    string? TriggeredByUserId,
    string? TriggeredByName
);

public record AcknowledgeNotificationsRequest(List<string>? NotificationIds);

public record RegisterPushTokenRequest(string Token, string? Platform);

public record UnregisterPushTokenRequest(string Token);

public record UserDto(
    string Id,
    string Email,
    string FullName,
    string Role,
    string Office,
    bool IsActive,
    bool IsFirstLogin,
    bool Is2faEnabled = false,
    int RecoveryCodesRemaining = 0,
    bool PasswordExpired = false
);

public record SessionDto(
    string Id,
    string IpAddress,
    string UserAgent,
    DateTime CreatedAt,
    DateTime LastActiveAt,
    bool IsCurrent
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
    string? Country,
    string? ZipCode,
    string? ContactName,
    string? ContactPhone,
    string? ContactEmail,
    string? Notes,
    DateTime CreatedAt
);

public record CreateSiteRequest(
    string? CustomerId,
    string Name,
    string? Address,
    string? City,
    string? State,
    string? Country,
    string? ZipCode,
    string? ContactName,
    string? ContactPhone,
    string? ContactEmail,
    string? Notes
);

public record UpdateSiteRequest(
    string? CustomerId,
    string? Name,
    string? Address,
    string? City,
    string? State,
    string? Country,
    string? ZipCode,
    string? ContactName,
    string? ContactPhone,
    string? ContactEmail,
    string? Notes
);

public record DivisionDto(
    string Id,
    string Name,
    string? Description,
    int SortOrder,
    bool IsActive
);

public record CreateDivisionRequest(string Name, string? Description, int SortOrder = 99);
public record UpdateDivisionRequest(string? Name, string? Description, int? SortOrder, bool? IsActive);

public record FeatureDto(
    string Id,
    string Name,
    string? Description,
    string ValueType,
    List<string>? Options,
    List<FeatureSubPropertyDto>? SubProperties,
    bool IsInventory,
    List<string>? CaptureFields,
    string? Brand = null,
    string? Supplier = null,
    string? AlternativePartNumber = null,
    decimal? UnitPrice = null,
    string? ProductLink = null,
    string? ManufacturerPartNumber = null,
    List<string>? LinkedProducts = null,
    List<string>? LinkedProductIds = null
);

public record CreateFeatureRequest(
    string Name,
    string? Description,
    string ValueType = "text",
    List<string>? Options = null,
    List<FeatureSubPropertyDto>? SubProperties = null,
    bool IsInventory = false,
    List<string>? CaptureFields = null,
    string? Brand = null,
    string? Supplier = null,
    string? AlternativePartNumber = null,
    decimal? UnitPrice = null,
    string? ProductLink = null,
    string? ManufacturerPartNumber = null
);

public record UpdateFeatureRequest(
    string? Name,
    string? Description,
    string? ValueType,
    List<string>? Options,
    List<FeatureSubPropertyDto>? SubProperties,
    bool? IsInventory,
    List<string>? CaptureFields,
    string? Brand = null,
    string? Supplier = null,
    string? AlternativePartNumber = null,
    decimal? UnitPrice = null,
    string? ProductLink = null,
    string? ManufacturerPartNumber = null
);

public record FeatureDependencyDto(
    string Id,
    string FeatureId,
    string Name,
    bool IsInventory,
    List<string> CaptureFields,
    decimal DefaultQty,
    string? Unit,
    decimal UnitPrice,
    int SortOrder
);

public record CreateFeatureDependencyRequest(
    string FeatureId,
    string Name,
    bool IsInventory = false,
    List<string>? CaptureFields = null,
    decimal DefaultQty = 1,
    string? Unit = null,
    decimal UnitPrice = 0,
    int SortOrder = 0
);

public record UpdateFeatureDependencyRequest(
    string? Name,
    bool? IsInventory,
    List<string>? CaptureFields,
    decimal? DefaultQty,
    string? Unit,
    decimal? UnitPrice,
    int? SortOrder
);

public record WorkflowConfigFeatureDto(
    string Id,
    string WorkflowConfigId,
    string FeatureId,
    int Quantity,
    /// <summary>JSON string: { [dependencyId]: bool }</summary>
    string InclusionsJson,
    int SortOrder
);

public record UpsertWorkflowConfigFeatureRequest(
    string WorkflowConfigId,
    string FeatureId,
    int Quantity = 1,
    string? InclusionsJson = null,
    int SortOrder = 0
);

public record ProductDto(
    string Id,
    string Name,
    string? Description,
    List<ProductFeatureDefinitionDto>? Features,
    string? DivisionId = null,
    string? DivisionName = null
);

public record FeatureSubPropertyDto(
    string Id,
    string Name,
    string ValueType
);

public record ProductFeatureDefinitionDto(
    string Id,
    string Name,
    string ValueType,
    List<string>? Options,
    int Quantity,
    List<FeatureSubPropertyDto>? SubProperties
);

public record FeatureSelectionDto(string FeatureId, bool Included, int ActiveCount);

public record WorkInstructionTemplateDto(
    string Id,
    string Name,
    string ProductId,
    string Status,
    List<FeatureSelectionDto> FeatureSelections,
    string? Notes,
    string? WorkflowTemplateId,
    string? ConfigType,
    string? CreatedBy,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record UpsertWITemplateRequest(
    string Name,
    string ProductId,
    string Status,
    List<FeatureSelectionDto> FeatureSelections,
    string? Notes,
    string? WorkflowTemplateId,
    string? ConfigType
);

public record SaveAsRequest(string Name);

public record CreateProductRequest(
    string Name,
    string? Description,
    List<ProductFeatureDefinitionDto>? Features,
    string? DivisionId = null
);

public record UpdateProductRequest(
    string? Name,
    string? Description,
    List<ProductFeatureDefinitionDto>? Features,
    string? DivisionId = null
);

public class DeleteProductRequest
{
    /// <summary>Feature IDs to fully delete (only if they have no other product links after unlinking).</summary>
    public List<string> DeleteFeatureIds { get; set; } = new();
    /// <summary>Asset IDs to fully delete. Assets NOT in this list have their ProductId nullified.</summary>
    public List<string> DeleteAssetIds { get; set; } = new();
    /// <summary>Workflow config IDs to fully delete. Workflows NOT in this list have their ProductId nullified.</summary>
    public List<string> DeleteWorkflowIds { get; set; } = new();
}

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
    string? SiteId,
    string? SiteName,
    string JobNumber,
    string PurchaseOrderNumber,
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
    int MinimumCompletionPercent,
    DateTime? CompletedAtUtc,
    string? CompletedBy,
    DateTime? ClosedAtUtc,
    string? ClosedBy,
    List<string>? ProductIds,
    Dictionary<string, string>? ProductFeatureValues,
    string? OfficeId = null,
    int AssetCount = 0,
    /// <summary>INSTALLATION_ONLY | INSPECTION_ONLY | MIXED. Null on legacy rows.</summary>
    string? WorkflowMode = null,
    /// <summary>Single Settings workflow type id. Null on legacy MIXED until PM picks one.</summary>
    string? WorkflowTypeId = null,
    List<string>? TeamMemberIds = null,
    bool IsDeleted = false,
    DateTime? DeletedAtUtc = null,
    string? DeletedByUserId = null,
    string? DeleteReason = null,
    // IANA timezone id for the project site (e.g. "Australia/Sydney"). Display-only;
    // instants stay UTC. Null falls back to UTC when rendering reports/timestamps.
    string? TimeZoneId = null,
    ProjectScheduledReportDto? ScheduledReport = null
);

public record ProjectScheduledReportDto(
    bool Enabled,
    string Frequency,
    List<string>? DaysOfWeek,
    string? SendTimeLocal,
    List<string>? RecipientEmails,
    bool AssetClosedNotificationEnabled = false,
    DateTime? LastSentAtUtc = null
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
    Dictionary<string, string>? CustomFields,
    bool IsDeleted = false,
    DateTime? DeletedAtUtc = null,
    string? DeletedByUserId = null,
    string? DeleteReason = null
);

public record QuickbaseSettingsDto(
    bool Enabled,
    string RealmHostname,
    string UserToken,
    string ProjectsTableId,
    string InstallationsTableId,
    Dictionary<string, int> ProjectsFieldMap,
    Dictionary<string, int> InstallationsFieldMap,
    string GoodsMovementsTableId,
    int GoodsMovementsJobFid,
    int GoodsMovementsOrderRefFid,
    int GoodsMovementsDirectionFid
);

public record GoodsMovementDto(
    string Direction,
    string MovementRef,
    string Date,
    string ToFrom,
    string ConsignmentRef,
    string JobNumber,
    string OrderRef,
    string Goods,
    string HandledBy,
    string NavPoNumber,
    string RecordId,
    Dictionary<string, string> RawFields
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
    Dictionary<string, string> BaseFieldNames,
    Dictionary<string, BaseFieldMetaDto> BaseFieldMeta
);

public record BaseFieldMetaDto(
    string? FieldType,
    bool Required,
    List<string>? Options
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
    string? DownloadUrl,
    string? CreatedBy,
    string? Notes,
    string? CustomValuesJson,
    bool IsDeleted = false,
    DateTime? DeletedAtUtc = null,
    string? DeletedByUserId = null,
    string? DeleteReason = null
);

public record RecycleBinItemDto(
    string EntityType,
    string Id,
    string Title,
    string? Subtitle,
    string? ParentId,
    string? ParentTitle,
    DateTime? DeletedAtUtc,
    string? DeletedByUserId
);

public record BackupCatalogItemDto(
    string EntityType,
    string Id,
    string Title,
    string? Subtitle,
    string? ParentId,
    string? ParentTitle,
    bool IsDeleted,
    DateTime? DeletedAtUtc
);

public record RestoreBackupRequest(string FileName);

public record RestoreBackupItemRequest(
    string FileName,
    string EntityType,
    string EntityId
);

public record RestoreBackupResponse(
    string RestoredFromFileName,
    string SafeguardBackupFileName,
    DateTime RestoredAtUtc
);

public record SelectiveRestoreResultDto(
    string EntityType,
    string EntityId,
    string Title,
    int RecordsRestored,
    string? Note
);

public record DocumentConfigDto(string TabsJson, string FieldsJson);

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

public record ProjectDomainPermissions(bool View, string ViewScope = "own", bool Edit = false, string EditScope = "none", bool Approve = false, bool Delete = false);
public record InstallationAssetsDomainPermissions(
    bool View,
    string ViewScope = "own",
    bool Edit = false,
    string EditScope = "none",
    bool RunWorkflow = false,
    bool Delete = false,
    bool ViewCapture = true,
    bool EditCapture = false,
    string EditCaptureScope = "none"
);
public record WorkInstructionsBuilderDomainPermissions(bool View, string ViewScope = "own", bool Build = false, bool Publish = false, bool Archive = false);
public record DocumentsDomainPermissions(bool View, string ViewScope = "own", bool Upload = false, bool Delete = false);
public record SettingsDomainPermissions(bool View, bool Edit);

public record DomainPermissions(
    ProjectDomainPermissions Projects,
    InstallationAssetsDomainPermissions InstallationAssets,
    WorkInstructionsBuilderDomainPermissions WorkInstructionsBuilder,
    DocumentsDomainPermissions Documents,
    SettingsDomainPermissions Settings
);

public record RolePermissions(
    bool ViewOnly,
    bool CreateDeleteTables,
    bool CreateUsers,
    bool EditFields,
    bool ModifyData,
    bool EditForms,
    DomainPermissions? Domains = null
);

public record RoleConfigDto(
    Dictionary<string, RolePermissions> Roles
);

public record OfficeDto(
    string Id,
    string Country,
    string State,
    string City,
    double Lat,
    double Lng
);

public record CreateOfficeRequest(
    string Country,
    string State,
    string City,
    double Lat,
    double Lng
);

public record UpdateOfficeRequest(
    string? Country,
    string? State,
    string? City,
    double? Lat,
    double? Lng
);

public record WorkflowTemplateDto(
    string Id,
    string Name,
    string ProductId,
    string? WorkflowTypeId,
    string StepsJson,
    string MediaJson,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record UpsertWorkflowTemplateRequest(
    string Name,
    string ProductId,
    string? WorkflowTypeId,
    string StepsJson,
    string? MediaJson
);

public record WorkInstructionDto(
    string Id,
    string ProductId,
    string Title,
    string? Summary,
    string StepsJson,
    string Status,
    string FeatureValuesJson,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record UpsertWorkInstructionRequest(
    string Title,
    string? Summary,
    string StepsJson,
    string Status,
    string? FeatureValuesJson
);

public record WorkOrderDto(
    string Id,
    string WorkflowTemplateId,
    string ProductId,
    string JobReference,
    string Status,
    string StepsDataJson,
    string? ProjectAssetId,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record UpsertWorkOrderRequest(
    string? WorkflowTemplateId,
    string? ProductId,
    string? JobReference,
    string? Status,
    string? StepsDataJson,
    string? ProjectAssetId,
    string? Notes
);

public record ProjectAssetDto(
    string Id,
    string ProjectId,
    string ProductId,
    string? ProductConfigId,
    string? WorkflowTemplateId,
    string AssetTag,
    string? AssetName,
    string? SerialNumber,
    string? AssetModel,
    string? Manufacturer,
    string? Location,
    string? AssignedUserId,
    string Status,
    string? WorkOrderId,
    string? Notes,
    string FeatureValuesJson,
    string IssuesJson,
    string? ConfigLabel,
    DateTime? InstalledAt,
    string? InstalledBy,
    string AsBuiltJson,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    ProjectAssetWorkflowSummaryDto? WorkflowSummary,
    bool IsDeleted = false,
    DateTime? DeletedAtUtc = null,
    string? DeletedByUserId = null,
    string? DeleteReason = null
);

public record ProjectAssetWorkflowSummaryDto(
    bool HasWorkflow,
    string EvidenceStatus,
    int RequiredItems,
    int CompletedItems,
    int MissingItems,
    string? LatestRunId,
    string? LatestRunStatus,
    bool LatestRunLocked,
    string? SignatureStatus,
    bool HasOpenIssues,
    DateTime? LatestRunStartedAt,
    DateTime? LatestRunCompletedAt
);

public record PaginatedProjectAssetsResponse(
    List<ProjectAssetDto> Items,
    int Total,
    int Page,
    int PageSize,
    bool HasMore
);

public record AssetWorkflowRunSummaryDto(
    string Id,
    string AssetId,
    string WorkflowConfigId,
    string Status,
    bool IsLocked,
    string SignatureStatus,
    DateTime StartedAt,
    DateTime? CompletedAt,
    DateTime UpdatedAt,
    int RunNumber,
    int ProductiveSeconds,
    int DowntimeSeconds,
    bool HasBomActual,
    string? CompletedByName,
    DateTime? InstallerSignedAt,
    DateTime? CustomerSignedAt
);

public record UpsertProjectAssetRequest(
    string? ProjectId,
    string? ProductId,
    string? ProductConfigId,
    string? WorkflowTemplateId,
    string? AssetTag,
    string? AssetName,
    string? SerialNumber,
    string? AssetModel,
    string? Manufacturer,
    string? Location,
    string? AssignedUserId,
    string? Status,
    string? WorkOrderId,
    string? Notes,
    string? FeatureValuesJson,
    string? IssuesJson,
    string? ConfigLabel
);

public record BulkCreateProjectAssetsRequest(
    string ProjectId,
    string ProductId,
    List<UpsertProjectAssetRequest> Assets
);

public record PatchIssuesRequest(string? IssuesJson);
public record PatchAssignmentRequest(string? AssignedUserId);

// ─── v2 Workflow Config Unification DTOs ──────────────────────────────────────

public record WorkflowConfigDto(
    string Id,
    string ProductId,
    string Name,
    string? DisplayName,
    string? ConfigType,
    string? WorkflowTypeId,
    string Status,
    int Version,
    string? TemplateSourceId,
    string StepsJson,
    string MediaJson,
    string FeatureSelectionsJson,
    string? Notes,
    string? CreatedBy,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record UpsertWorkflowConfigRequest(
    string? Name,
    string? ProductId,
    string? DisplayName,
    string? ConfigType,
    string? WorkflowTypeId,
    string? Notes,
    string? StepsJson,
    string? MediaJson,
    string? FeatureSelectionsJson
);

public record WorkflowTypeDto(
    string Id,
    string Name,
    string? Icon,
    int SortOrder,
    bool IsActive
);

public record UpsertWorkflowTypeRequest(
    string Name,
    string? Icon,
    int SortOrder
);

public record AssetWorkflowAssignmentDto(
    string Id,
    string AssetId,
    string WorkflowConfigId,
    string WorkflowTypeId,
    string WorkflowTypeName,
    string WorkflowConfigName,
    bool Active,
    string? AssignedBy,
    DateTime AssignedAt
);

public record CreateAssignmentRequest(
    string AssetId,
    string WorkflowConfigId,
    string WorkflowTypeId
);

public record AssetWorkflowRunListItemDto(
    string Id,
    string AssetId,
    string ProjectId,
    string WorkflowConfigId,
    string? WorkflowTypeId,
    string WorkflowTypeName,
    string? AssetName,
    string? AssignedUserId,
    string? AssignedTo,
    string Status,
    bool IsLocked,
    DateTime StartedAt,
    DateTime? CompletedAt,
    DateTime UpdatedAt
);

public record AssetWorkflowRunDto(
    string Id,
    string AssetId,
    string WorkflowConfigId,
    int WorkflowVersion,
    string WorkflowSnapshotJson,
    string? WorkOrderId,
    string Status,
    bool IsLocked,
    string? TechnicianUserId,
    string StepResultsJson,
    string IssuesJson,
    string TimeTrackingJson,
    int ProductiveSeconds,
    int DowntimeSeconds,
    int DowntimeEvents,
    int RunNumber,
    string? CompletedByName,
    string SignatureStatus,
    DateTime? InstallerSignedAt,
    DateTime? CustomerSignedAt,
    DateTime StartedAt,
    DateTime? CompletedAt,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    string BomActualJson,
    // Amendment summary — lets a capture table label "Edited by <role> — <name>" for many
    // runs without a query per row. Full before/after history: GET {id}/amendments.
    string? LastAmendedByName = null,
    string? LastAmendedByRole = null,
    DateTime? LastAmendedAtUtc = null,
    int AmendmentCount = 0
);

public record RunAmendmentDto(
    string Id,
    string RunId,
    string AssetId,
    string Kind,
    string? StepId,
    string? InputId,
    int? IterationIndex,
    string? FieldLabel,
    string? OldValue,
    string? NewValue,
    string SignatureStatusAtAmend,
    string? AmendedByUserId,
    string AmendedByName,
    string? AmendedByRole,
    DateTime AmendedAtUtc
);

public record StartRunRequest(
    string AssetId,
    string WorkflowConfigId,
    string? TechnicianUserId,
    string? StartedAtUtc,
    string? TimeTrackingJson
);

public record SaveRunProgressRequest(
    string StepResultsJson,
    string? IssuesJson,
    string? Status
);

public record CompleteRunRequest(
    string? StepResultsJson,
    string IssuesJson,
    string? CompletedByName,
    string? BomActualJson,
    // Real completion moment. Offline-completed runs send when the installer actually
    // finished so the server closes the final time segment at that instant instead of at
    // sync time (which would inflate it). Online callers omit it and fall back to now.
    string? CompletedAtUtc = null,
    /// When true, use StepResultsJson already persisted on the run row (web perf F4).
    bool UseStoredStepResults = false
);

public record SyncRunBundleSignatureRequest(
    string SignerRole,
    SubmitSignatureRequest Payload
);

public record SyncRunBundleRequest(
    string StepResultsJson,
    string IssuesJson,
    string? CompletedByName,
    string? CompletedAtUtc,
    string? BomActualJson,
    List<SyncRunBundleSignatureRequest>? Signatures,
    string? IdempotencyKey
);

public record SyncRunBundleResponse(
    AssetWorkflowRunDto Run,
    List<SignatureEventDto> Signatures
);

public record PatchTimeEntriesRequest(string TimeEntriesJson);
public record PatchStepResultsRequest(string StepResultsJson, string? AmendedByName, string? AmendedAt, bool CaptureDataAmend = false);
public record PatchCaptureCellRequest(
    string StepId,
    string InputId,
    int? IterationIndex,
    string Value,
    string? AmendedByName,
    // Optional display label so the amendment log reads "Serial" rather than a raw input id.
    string? FieldLabel = null
);
public record TrackRunTimeRequest(
    string Action,
    string? Reason,
    string? StartedAtUtc,
    string? EndedAtUtc
);

public record BrandSettingDto(string? LogoBase64, string? AppName);
public record UpdateBrandSettingRequest(string? LogoBase64, string? AppName);

// ─── Asset Documents ──────────────────────────────────────────────────────────
public record AssetDocumentRevisionDto(
    string Id,
    int RevisionNumber,
    string OriginalName,
    string MimeType,
    long FileSizeBytes,
    string? UploadedBy,
    DateTime UploadedAt
);

public record AssetDocumentDto(
    string Id,
    string AssetId,
    string Label,
    string? CreatedBy,
    DateTime CreatedAt,
    AssetDocumentRevisionDto? CurrentRevision,
    IEnumerable<AssetDocumentRevisionDto> History
);

public record PatchDocumentLabelRequest(string Label);

// ─── Asset Document Links (bridge: asset ↔ library document) ─────────────────
public record AssetDocumentLinkDto(
    string Id,
    string AssetId,
    string DocumentId,
    string? AttachedBy,
    DateTime AttachedAt,
    DocumentDto Document
);

public record CreateAssetDocumentLinkRequest(
    string AssetId,
    string DocumentId,
    string? AttachedBy
);

// ─── Project CRM — Contacts ────────────────────────────────────────────────────
public record ProjectContactDto(
    string Id,
    string ProjectId,
    string Name,
    string? Title,
    string? Email,
    string? Phone,
    string PreferredSignMethod,
    bool IsPrimarySigner,
    bool CcReports,
    string? Address,
    DateTime CreatedAt
);

public record UpsertProjectContactRequest(
    string Name,
    string? Title,
    string? Email,
    string? Phone,
    string PreferredSignMethod,
    bool IsPrimarySigner,
    bool CcReports,
    string? Address
);

// ─── Project CRM — Delivery Profiles ──────────────────────────────────────────
public record ProjectDeliveryProfileDto(
    string Id,
    string ProjectId,
    string Label,
    string? ContactName,
    string? ContactPhone,
    string? ContactEmail,
    string? AddressLine1,
    string? AddressLine2,
    string? City,
    string? State,
    string? PostCode,
    string? Country,
    string? DeliveryNotes,
    string? AccessHours,
    bool IsDefault,
    DateTime CreatedAt
);

public record UpsertProjectDeliveryProfileRequest(
    string Label,
    string? ContactName,
    string? ContactPhone,
    string? ContactEmail,
    string? AddressLine1,
    string? AddressLine2,
    string? City,
    string? State,
    string? PostCode,
    string? Country,
    string? DeliveryNotes,
    string? AccessHours,
    bool IsDefault
);

// ─── Project CRM — Inbound Items ──────────────────────────────────────────────
public record ProjectInboundItemDto(
    string Id,
    string ProjectId,
    string Description,
    decimal Quantity,
    string? Unit,
    string Condition,
    string? ReferenceNumber,
    string? ReceivedDate,
    string? ReceivedBy,
    string? Notes,
    string ItemType,
    DateTime CreatedAt
);

public record UpsertProjectInboundItemRequest(
    string Description,
    decimal Quantity,
    string? Unit,
    string Condition,
    string? ReferenceNumber,
    string? ReceivedDate,
    string? ReceivedBy,
    string? Notes,
    string ItemType
);

// ─── Signatures ───────────────────────────────────────────────────────────────
public record SignatureEventDto(
    string Id,
    string RunId,
    string SignerRole,
    string SignerName,
    string? SignerEmail,
    string? SignerTitle,
    DateTime SignedAtUtc,
    bool HasDrawnSignature,
    string? SignatureData,   // base64 PNG — included for report generation
    string? DeviceInfo,
    string? IpAddress,
    string ReasonCode,
    string? Notes,
    string? TokenId
);

public record SubmitSignatureRequest(
    string SignerRole,
    string SignerName,
    string? SignerEmail,
    string? SignerTitle,
    string? SignatureData,
    string ReasonCode,
    string? Notes,
    bool ConsentConfirmed
);

// ─── Signature Tokens ─────────────────────────────────────────────────────────
public record SignatureTokenDto(
    string Id,
    string RunId,
    string SignerRole,
    string? ContactId,
    string RecipientEmail,
    string? RecipientName,
    DateTime CreatedAtUtc,
    DateTime ExpiresAtUtc,
    DateTime? UsedAtUtc,
    bool IsRevoked,
    bool IsExpired,
    bool EmailSent
);

public record CreateSignatureTokenRequest(
    string RunId,
    string? SignerRole,
    string? ContactId,
    string? RecipientEmail,
    string? RecipientName,
    int ExpiresInHours,
    string? CustomMessage
);

public record PublicRunSummaryDto(
    string RunId,
    string AssetName,
    string AssetSerial,
    string WorkflowName,
    string ProjectJobNumber,
    string CustomerName,
    string CompletedByName,
    DateTime CompletedAt,
    string SignatureStatus,
    string SignerRole,
    string RecipientName,
    string RecipientEmail,
    bool TokenValid,
    // Fields needed to generate the PDF report on the client
    string WorkflowSnapshotJson,
    string StepResultsJson,
    string IssuesJson,
    string? AssetTag,
    string? AssetLocation,
    // Installer signature (already captured; customer can see it in the report)
    string? InstallerSignerName,
    string? InstallerSignatureData,
    string? InstallerReasonCode,
    string? InstallerNotes,
    DateTime? InstallerSignedAt,
    // Project site timezone so the customer-facing PDF renders wall-clock times consistently.
    string? TimeZoneId = null,
    string? Office = null,
    string? Region = null,
    string? OfficeCountry = null,
    string? OfficeState = null,
    // Full run + asset metadata for report parity with internal View/Export
    DateTime? StartedAt = null,
    string? TimeTrackingJson = null,
    int ProductiveSeconds = 0,
    int DowntimeSeconds = 0,
    int DowntimeEvents = 0,
    int RunNumber = 1,
    string? AssetModel = null,
    string? Manufacturer = null,
    string? SiteName = null,
    string? AssignedTechnicianName = null,
    string? BusinessLogoBase64 = null,
    string? CustomerLogoBase64 = null,
    string? CompanyName = null,
    string? ProductFeaturesJson = null
);

public record PublicSubmitSignatureRequest(
    string SignerName,
    string? SignerTitle,
    string? SignatureData,
    string ReasonCode,
    string? Notes,
    bool ConsentConfirmed,
    string? OtpCode
);

public record RequestOtpRequest(string TokenId);

// ─── Dispatch / Logistics ─────────────────────────────────────────────────────
public record DispatchOrderDto(
    string Id,
    string ProjectId,
    string? DeliveryProfileId,
    string? DeliveryProfileLabel,
    string? RequestedByName,
    string? NeededByDate,
    string Priority,
    string Status,
    string? Carrier,
    string? TrackingNumber,
    string? TrackingUrl,
    string? InternalNotes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    List<DispatchLineDto> Lines,
    List<DeliveryEventDto> Events
);

public record UpsertDispatchOrderRequest(
    string ProjectId,
    string? DeliveryProfileId,
    string? RequestedByName,
    string? NeededByDate,
    string Priority,
    string Status,
    string? Carrier,
    string? TrackingNumber,
    string? TrackingUrl,
    string? InternalNotes
);

public record DispatchLineDto(
    string Id,
    string OrderId,
    string Description,
    string? PartNumber,
    decimal QuantityRequested,
    decimal QuantityShipped,
    string? Unit,
    decimal? UnitCost,
    bool IsBillable,
    string? TaxCode,
    string? Notes
);

public record UpsertDispatchLineRequest(
    string Description,
    string? PartNumber,
    decimal QuantityRequested,
    decimal QuantityShipped,
    string? Unit,
    decimal? UnitCost,
    bool IsBillable,
    string? TaxCode,
    string? Notes
);

public record DeliveryEventDto(
    string Id,
    string OrderId,
    string EventType,
    DateTime OccurredAtUtc,
    string? Location,
    string? Notes,
    string? RecordedBy
);

public record AddDeliveryEventRequest(
    string EventType,
    DateTime? OccurredAtUtc,
    string? Location,
    string? Notes,
    string? RecordedBy
);

public record PendingSignatureDto(
    string RunId,
    string AssetId,
    string AssetTag,
    string AssetName,
    string ProjectId,
    string JobNumber,
    string CustomerName,
    string CompletedAt,
    string CompletedBy,
    string SignatureStatus,
    string? CustomerLinkSentAt,
    string? ProjectTimeZoneId
);

/// <summary>
/// Flat projection of a single unresolved issue surfaced in the cross-project Issues Board.
/// Issues are embedded as JSON blobs on AssetWorkflowRun.IssuesJson; this DTO extracts them
/// with the surrounding project / asset context so the board can render without N+1 calls.
/// </summary>
public record OpenIssueDto(
    string IssueId,
    string Description,
    string IssueType,   // "blocking" | "observation" | "scope-deviation"
    string Severity,    // "low" | "medium" | "high"
    bool IsBlocking,
    string ReportedAt,
    string? CreatedBy,
    string? StepTitle,
    string RunId,       // empty string when Source == "asset"
    string AssetId,
    string AssetTag,
    string AssetName,
    string AssetLocation,
    string ProjectId,
    string JobNumber,
    string CustomerName,
    string Source       // "run" | "asset"
);

/// <summary>
/// Flat projection of a resolved issue for the Issues History board.
/// Extends the open-issue context with resolution fields.
/// </summary>
public record ClosedIssueDto(
    string IssueId,
    string Description,
    string IssueType,
    string Severity,
    bool IsBlocking,
    string ReportedAt,
    string? CreatedBy,
    string? StepTitle,
    string RunId,
    string AssetId,
    string AssetTag,
    string AssetName,
    string AssetLocation,
    string ProjectId,
    string JobNumber,
    string CustomerName,
    string Source,
    string? ResolvedAt,
    string? ResolvedBy,
    string? ResolutionNote
);

/// <summary>Result returned after cloning assets from one project into another.</summary>
public record CloneAssetsResult(int AssetsCloned, int AssignmentsCloned);

/// <summary>Per-technician open-asset counts for the Dashboard workload panel.</summary>
public record WorkloadSummaryDto(
    string UserId, string FullName,
    int NotStarted, int InProgress, int Paused, int TotalAssigned,
    List<string> JobNumbers,
    bool HasIssues,
    int CompletedSteps, int TotalSteps,
    string? StartedAt);

/// <summary>Per-technician workload summary using the same counting logic as dashboard-workspace (Paused → In Progress → Not Started).</summary>
public record TechnicianWorkloadSummaryDto(
    string UserId,
    string FullName,
    int Paused,
    int InProgress,
    int NotStarted,
    int TotalAssigned,
    List<string> JobNumbers,
    bool HasIssues,
    int CompletedSteps,
    int TotalSteps,
    string? StartedAt);

/// <summary>Per-project asset status counts for the Dashboard regional snapshot.</summary>
public record ProjectAssetSummaryDto(string ProjectId, int NotStarted, int InProgress, int Complete, int Total);

public record PaperCompletionResultDto(
    string AssetId,
    string AssetStatus,
    string RunId,
    string SignatureStatus,
    string DocumentId,
    string DocumentName);

/// <summary>Open (not-yet-complete) asset with parent project context for the Dashboard Active Installations panel.</summary>
public record OpenAssetDto(
    string Id,
    string ProjectId,
    string JobNumber,
    string Office,
    string? OfficeId,
    string? AssetTag,
    string? AssetName,
    string? AssetModel,
    string? Manufacturer,
    bool HasWorkflow,
    string Status,
    string? RunStatus,
    int CompletedSteps,
    int TotalSteps,
    int MissingItems,
    string? EvidenceStatus,
    string? AssignedUserId,
    string? Location
);

public record DashboardWorkspaceAssetDto(
    string Id,
    string ProjectId,
    string JobNumber,
    string? AssetTag,
    string? AssetName,
    string? AssetModel,
    string? Location,
    string Status,
    string? RunStatus,
    string HistoryStatus,
    int CompletedSteps,
    int TotalSteps,
    int MissingItems,
    string? EvidenceStatus,
    string? AssignedUserId,
    string WorkflowMode,
    bool IsDeleted,
    DateTime? DeletedAtUtc,
    string? DeleteReason,
    DateTime? LatestActivityAt,
    DateTime? CompletedAt,
    bool HasOpenIssues,
    string? SignatureStatus
);

public record DashboardWorkspaceDto(
    List<DashboardWorkspaceAssetDto> CurrentInstalls,
    List<DashboardWorkspaceAssetDto> CurrentInspections,
    List<DashboardWorkspaceAssetDto> InstallHistory,
    List<DashboardWorkspaceAssetDto> InspectionHistory
);

// ── Dashboard: Evidence Completeness ──────────────────────────────────────

public record EvidenceCompletenessDto(
    int WindowDays,
    int TotalRuns,
    int Signed,
    int SignedPct,
    int AllStepsComplete,
    int AllStepsCompletePct,
    int HasMedia,
    int HasMediaPct,
    int NoOpenIssues,
    int NoOpenIssuesPct,
    int OverallScore,
    List<EvidenceProjectDto> ByProject
);

public record EvidenceProjectDto(
    string ProjectId,
    string JobNumber,
    string CustomerName,
    int RunCount,
    int Score
);

// ── Dashboard: Workflow Health Score ──────────────────────────────────────

public record WorkflowHealthDto(
    int WindowDays,
    int OverallScore,
    int PreviousScore,
    int ScoreDelta,
    int TotalRuns,
    int CompletionRate,
    int FirstRunSuccessRate,
    int StepPassRate,
    int CleanClosureRate,
    List<WorkflowTypeHealthDto> ByType
);

public record WorkflowTypeHealthDto(
    string TypeName,
    int RunCount,
    int Score
);

// ── User bulk import ───────────────────────────────────────────────────────

public record BulkImportUserRow(
    string FullName,
    string Email,
    string Role,
    string? Office
);

public record BulkImportUsersRequest(List<BulkImportUserRow> Users);

public record BulkImportUsersResult(
    int Created,
    int Skipped,
    List<string> SkippedEmails,
    List<string> Errors
);

// ─── Inspection Imports ───────────────────────────────────────────────────────

public record InspectionImportDto(
    string Id,
    string Source,
    DateTime ReceivedAt,
    string? FileName,
    string? ContentHash,
    string? RawJson,
    string? ProjectId,
    string? AssetId,
    string Status,
    string? ErrorText,
    string? MappedRunId,
    string? UploadedBy
);

public record CreateInspectionImportRequest(
    string Source,
    string? FileName,
    string? RawJson,
    string? ProjectId,
    string? AssetId,
    string? ProjectAssetId,
    string? UploadedBy
);

public record AssignInspectionImportRequest(
    string ProjectId,
    string? AssetId,
    string? ProjectAssetId
);

// ─── Asset report share / email (web desktop bulk reports only) ───────────────
public record AssetReportShareRecipientRequest(
    string Email,
    string? Name
);

public record AssetReportShareAttachmentRequest(
    string FileName,
    string ContentBase64
);

public record CreateAssetReportShareRequest(
    string? ProjectId,
    string? JobLabel,
    string? Message,
    List<AssetReportShareRecipientRequest> Recipients,
    List<AssetReportShareAttachmentRequest> Attachments,
    bool SendEmail,
    int ExpiresInHours
);

public record AssetReportShareEmailResultDto(
    string Email,
    bool Success,
    string? Message
);

public record CreateAssetReportShareResponse(
    string ShareId,
    string ShareUrl,
    string DownloadUrl,
    DateTime ExpiresAtUtc,
    List<AssetReportShareEmailResultDto> EmailResults
);

public record AssetReportShareFileDto(
    string FileName,
    string Label
);

public record AssetReportShareManifestDto(
    string ShareId,
    string? JobLabel,
    DateTime ExpiresAtUtc,
    List<AssetReportShareFileDto> Files,
    string DownloadUrl
);

// ── Fault reporting ─────────────────────────────────────────────────────────────

public record SubmitFaultReportRequest(
    string? Kind,
    string? Severity,
    string Title,
    string? Description,
    string? Platform,
    string? AppVersion,
    string? UserAgent,
    string? RoutePath,
    string? ErrorName,
    string? ErrorMessage,
    string? ErrorStack,
    string? TraceId,
    string? BreadcrumbsJson,
    string? DiagnosticsJson,
    bool? WasOffline,
    DateTime? OccurredAtUtc,
    string? ClientReferenceCode
);

public record FaultReportDto(
    string Id,
    string ReferenceCode,
    string Kind,
    string Severity,
    string Status,
    string Title,
    string? Description,
    string Platform,
    string? AppVersion,
    string? UserAgent,
    string? RoutePath,
    string? UserId,
    string? UserEmail,
    string? UserRole,
    string? ErrorName,
    string? ErrorMessage,
    string? TraceId,
    bool WasOffline,
    DateTime OccurredAtUtc,
    DateTime CreatedAtUtc,
    DateTime LastUpdatedAtUtc,
    string? Notes,
    DateTime? ResolvedAtUtc
);

public record FaultReportUpdateDto(
    string Id,
    string Action,
    string Status,
    string? AuthorName,
    bool SystemGenerated,
    DateTime CreatedAtUtc
);

public record AddFaultReportUpdateRequest(
    string Action,
    string? Status
);

/// <summary>List rows omit stack, breadcrumbs and diagnostics — fetch one report for those.</summary>
public record FaultReportDetailDto(
    FaultReportDto Report,
    string? ErrorStack,
    string? BreadcrumbsJson,
    string? DiagnosticsJson,
    List<FaultReportUpdateDto> Updates
);

public record UpdateFaultReportRequest(
    string? Status,
    string? Severity,
    string? Notes
);

public record FaultReportSummaryDto(
    int Total,
    int New,
    int Investigating,
    int Unresolved,
    int LastSevenDays
);
