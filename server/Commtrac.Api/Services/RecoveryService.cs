using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Services;

public sealed class RecoveryService
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _environment;
    private readonly SqliteBackupService _backupService;
    private readonly IDocumentSearchIndexQueue _searchIndexQueue;

    public RecoveryService(
        AppDbContext db,
        IWebHostEnvironment environment,
        SqliteBackupService backupService,
        IDocumentSearchIndexQueue searchIndexQueue)
    {
        _db = db;
        _environment = environment;
        _backupService = backupService;
        _searchIndexQueue = searchIndexQueue;
    }

    public async Task<IReadOnlyList<RecycleBinItemDto>> ListRecycleBinAsync(string? search, string? entityType, CancellationToken cancellationToken = default)
    {
        var term = search?.Trim().ToLowerInvariant();
        var type = NormalizeEntityType(entityType);
        var items = new List<RecycleBinItemDto>();

        if (type is null || type == "project")
        {
            var projects = await _db.Projects
                .IgnoreQueryFilters()
                .Where(p => p.IsDeleted)
                .Where(p =>
                    string.IsNullOrWhiteSpace(term) ||
                    p.JobNumber.ToLower().Contains(term!) ||
                    p.CustomerName.ToLower().Contains(term!) ||
                    p.Description.ToLower().Contains(term!))
                .OrderByDescending(p => p.DeletedAtUtc)
                .Take(100)
                .ToListAsync(cancellationToken);

            items.AddRange(projects.Select(p => new RecycleBinItemDto(
                "project",
                p.Id,
                p.JobNumber,
                string.Join(" | ", new[] { p.CustomerName, p.Description }.Where(v => !string.IsNullOrWhiteSpace(v))),
                null,
                null,
                p.DeletedAtUtc,
                p.DeletedByUserId
            )));
        }

        if (type is null || type == "installation")
        {
            var deletedInstallations = await _db.Installations
                .IgnoreQueryFilters()
                .Where(i => i.IsDeleted)
                .Join(
                    _db.Projects.IgnoreQueryFilters(),
                    installation => installation.ProjectId,
                    project => project.Id,
                    (installation, project) => new { installation, project })
                .Where(x =>
                    string.IsNullOrWhiteSpace(term) ||
                    x.installation.InstallationNumber.ToLower().Contains(term!) ||
                    (x.installation.InstallationName ?? string.Empty).ToLower().Contains(term!) ||
                    x.project.JobNumber.ToLower().Contains(term!))
                .OrderByDescending(x => x.installation.DeletedAtUtc)
                .Take(100)
                .ToListAsync(cancellationToken);

            items.AddRange(deletedInstallations.Select(x => new RecycleBinItemDto(
                "installation",
                x.installation.Id,
                x.installation.InstallationNumber,
                string.Join(" | ", new[] { x.installation.InstallationName, x.installation.SiteLocation }.Where(v => !string.IsNullOrWhiteSpace(v))),
                x.project.Id,
                x.project.JobNumber,
                x.installation.DeletedAtUtc,
                x.installation.DeletedByUserId
            )));
        }

        if (type is null || type == "asset")
        {
            var deletedAssets = await _db.ProjectAssets
                .IgnoreQueryFilters()
                .Where(a => a.IsDeleted)
                .Join(
                    _db.Projects.IgnoreQueryFilters(),
                    asset => asset.ProjectId,
                    project => project.Id,
                    (asset, project) => new { asset, project })
                .Where(x =>
                    string.IsNullOrWhiteSpace(term) ||
                    x.asset.AssetTag.ToLower().Contains(term!) ||
                    (x.asset.AssetName ?? string.Empty).ToLower().Contains(term!) ||
                    x.project.JobNumber.ToLower().Contains(term!))
                .OrderByDescending(x => x.asset.DeletedAtUtc)
                .Take(100)
                .ToListAsync(cancellationToken);

            items.AddRange(deletedAssets.Select(x => new RecycleBinItemDto(
                "asset",
                x.asset.Id,
                x.asset.AssetTag,
                string.Join(" | ", new[] { x.asset.AssetName, x.asset.Location }.Where(v => !string.IsNullOrWhiteSpace(v))),
                x.project.Id,
                x.project.JobNumber,
                x.asset.DeletedAtUtc,
                x.asset.DeletedByUserId
            )));
        }

        if (type is null || type == "document")
        {
            var documents = await _db.Documents
                .IgnoreQueryFilters()
                .Where(d => d.IsDeleted)
                .Where(d =>
                    string.IsNullOrWhiteSpace(term) ||
                    d.Name.ToLower().Contains(term!) ||
                    d.Type.ToLower().Contains(term!) ||
                    d.LinkedTo.ToLower().Contains(term!))
                .OrderByDescending(d => d.DeletedAtUtc)
                .Take(100)
                .ToListAsync(cancellationToken);

            items.AddRange(documents.Select(d => new RecycleBinItemDto(
                "document",
                d.Id,
                d.Name,
                string.Join(" | ", new[] { d.Type, d.LinkedTo }.Where(v => !string.IsNullOrWhiteSpace(v))),
                null,
                null,
                d.DeletedAtUtc,
                d.DeletedByUserId
            )));
        }

        if (type is null || type == "bomImportRun")
        {
            var bomRuns = await _db.BomImportRuns
                .IgnoreQueryFilters()
                .Where(r => r.IsDeleted)
                .Where(r =>
                    string.IsNullOrWhiteSpace(term) ||
                    r.FileName.ToLower().Contains(term!) ||
                    (r.StatusMessage ?? string.Empty).ToLower().Contains(term!))
                .OrderByDescending(r => r.DeletedAtUtc)
                .Take(100)
                .ToListAsync(cancellationToken);

            items.AddRange(bomRuns.Select(r => new RecycleBinItemDto(
                "bomImportRun",
                r.Id,
                r.FileName,
                string.Join(" | ", new[] { r.Status, r.StatusMessage }.Where(v => !string.IsNullOrWhiteSpace(v))),
                r.PublishedProjectId,
                r.PublishedProjectId,
                r.DeletedAtUtc,
                r.DeletedByUserId
            )));
        }

        return items
            .OrderByDescending(i => i.DeletedAtUtc ?? DateTime.MinValue)
            .ToList();
    }

    public async Task<IReadOnlyList<BackupCatalogItemDto>> ListBackupCatalogAsync(string fileName, string entityType, string? search, CancellationToken cancellationToken = default)
    {
        var type = NormalizeEntityType(entityType) ?? throw new InvalidOperationException("Unsupported entity type.");
        var term = search?.Trim();
        var backupPath = _backupService.ResolveBackupPath(fileName);

        return type switch
        {
            "project" => await ListProjectCatalogAsync(backupPath, term, cancellationToken),
            "asset" => await ListAssetCatalogAsync(backupPath, term, cancellationToken),
            "document" => await ListDocumentCatalogAsync(backupPath, term, cancellationToken),
            _ => throw new InvalidOperationException("Unsupported entity type.")
        };
    }

    public async Task<SelectiveRestoreResultDto> RestoreItemFromBackupAsync(string fileName, string entityType, string entityId, CancellationToken cancellationToken = default)
    {
        var type = NormalizeEntityType(entityType) ?? throw new InvalidOperationException("Unsupported entity type.");
        var backupPath = _backupService.ResolveBackupPath(fileName);

        return type switch
        {
            "project" => await RestoreProjectFromBackupAsync(backupPath, entityId, cancellationToken),
            "asset" => await RestoreAssetFromBackupAsync(backupPath, entityId, cancellationToken),
            "document" => await RestoreDocumentFromBackupAsync(backupPath, entityId, cancellationToken),
            _ => throw new InvalidOperationException("Unsupported entity type.")
        };
    }

    private async Task<IReadOnlyList<BackupCatalogItemDto>> ListProjectCatalogAsync(string backupPath, string? search, CancellationToken cancellationToken)
    {
        await using var backupDb = CreateBackupDbContext(backupPath);
        var query = backupDb.Projects.IgnoreQueryFilters().AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.ToLowerInvariant();
            query = query.Where(p => p.JobNumber.ToLower().Contains(term) || p.CustomerName.ToLower().Contains(term) || p.Description.ToLower().Contains(term));
        }

        var projects = await query
            .OrderByDescending(p => p.StartDate)
            .Take(100)
            .ToListAsync(cancellationToken);

        return projects.Select(p => new BackupCatalogItemDto(
            "project",
            p.Id,
            p.JobNumber,
            string.Join(" | ", new[] { p.CustomerName, p.Description }.Where(v => !string.IsNullOrWhiteSpace(v))),
            null,
            null,
            p.IsDeleted,
            p.DeletedAtUtc
        )).ToList();
    }

    private async Task<IReadOnlyList<BackupCatalogItemDto>> ListAssetCatalogAsync(string backupPath, string? search, CancellationToken cancellationToken)
    {
        await using var backupDb = CreateBackupDbContext(backupPath);
        var query = backupDb.ProjectAssets.IgnoreQueryFilters().AsNoTracking()
            .Join(
                backupDb.Projects.IgnoreQueryFilters().AsNoTracking(),
                asset => asset.ProjectId,
                project => project.Id,
                (asset, project) => new { asset, project });

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.ToLowerInvariant();
            query = query.Where(x =>
                x.asset.AssetTag.ToLower().Contains(term) ||
                (x.asset.AssetName ?? string.Empty).ToLower().Contains(term) ||
                x.project.JobNumber.ToLower().Contains(term));
        }

        var assets = await query
            .OrderByDescending(x => x.asset.UpdatedAt)
            .Take(100)
            .ToListAsync(cancellationToken);

        return assets.Select(x => new BackupCatalogItemDto(
            "asset",
            x.asset.Id,
            x.asset.AssetTag,
            string.Join(" | ", new[] { x.asset.AssetName, x.asset.Location }.Where(v => !string.IsNullOrWhiteSpace(v))),
            x.project.Id,
            x.project.JobNumber,
            x.asset.IsDeleted,
            x.asset.DeletedAtUtc
        )).ToList();
    }

    private async Task<IReadOnlyList<BackupCatalogItemDto>> ListDocumentCatalogAsync(string backupPath, string? search, CancellationToken cancellationToken)
    {
        var items = new List<BackupCatalogItemDto>();
        await using var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = backupPath, Mode = SqliteOpenMode.ReadOnly }.ToString());
        await connection.OpenAsync(cancellationToken);

        var hasIsDeleted = await TableHasColumnAsync(connection, "Documents", "IsDeleted", cancellationToken);
        var hasDeletedAt = await TableHasColumnAsync(connection, "Documents", "DeletedAtUtc", cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = $@"
SELECT Id, Name, Type, LinkedTo, UploadedAt, {(hasIsDeleted ? "IsDeleted" : "0 AS IsDeleted")}, {(hasDeletedAt ? "DeletedAtUtc" : "NULL AS DeletedAtUtc")}
FROM Documents
WHERE (@term = '' OR lower(Name) LIKE @like OR lower(Type) LIKE @like OR lower(LinkedTo) LIKE @like)
ORDER BY UploadedAt DESC
LIMIT 100;";
        var term = search?.Trim().ToLowerInvariant() ?? string.Empty;
        command.Parameters.AddWithValue("@term", term);
        command.Parameters.AddWithValue("@like", $"%{term}%");

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(new BackupCatalogItemDto(
                "document",
                reader.GetString(0),
                reader.GetString(1),
                string.Join(" | ", new[] { reader.IsDBNull(2) ? null : reader.GetString(2), reader.IsDBNull(3) ? null : reader.GetString(3) }.Where(v => !string.IsNullOrWhiteSpace(v))),
                null,
                null,
                !reader.IsDBNull(5) && reader.GetBoolean(5),
                reader.IsDBNull(6) ? null : reader.GetDateTime(6)
            ));
        }

        return items;
    }

    private async Task<SelectiveRestoreResultDto> RestoreProjectFromBackupAsync(string backupPath, string projectId, CancellationToken cancellationToken)
    {
        await using var backupDb = CreateBackupDbContext(backupPath);
        var project = await backupDb.Projects.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(p => p.Id == projectId, cancellationToken);
        if (project is null)
            throw new InvalidOperationException("Project was not found in the selected backup.");

        UpsertProject(project);

        var installations = await backupDb.Installations.IgnoreQueryFilters().AsNoTracking()
            .Where(i => i.ProjectId == projectId)
            .ToListAsync(cancellationToken);
        foreach (var installation in installations)
            UpsertInstallation(installation);

        var assets = await backupDb.ProjectAssets.IgnoreQueryFilters().AsNoTracking()
            .Where(a => a.ProjectId == projectId)
            .ToListAsync(cancellationToken);
        foreach (var asset in assets)
            UpsertAsset(asset);

        await _db.SaveChangesAsync(cancellationToken);
        return new SelectiveRestoreResultDto(
            "project",
            project.Id,
            project.JobNumber,
            1 + installations.Count + assets.Count,
            $"Restored project with {installations.Count} installations and {assets.Count} assets."
        );
    }

    private async Task<SelectiveRestoreResultDto> RestoreAssetFromBackupAsync(string backupPath, string assetId, CancellationToken cancellationToken)
    {
        await using var backupDb = CreateBackupDbContext(backupPath);
        var asset = await backupDb.ProjectAssets.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(a => a.Id == assetId, cancellationToken);
        if (asset is null)
            throw new InvalidOperationException("Asset was not found in the selected backup.");

        string? note = null;
        var project = await _db.Projects.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Id == asset.ProjectId, cancellationToken);
        if (project is null)
        {
            var backupProject = await backupDb.Projects.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(p => p.Id == asset.ProjectId, cancellationToken);
            if (backupProject is not null)
            {
                UpsertProject(backupProject);
                note = $"Parent project {backupProject.JobNumber} was also restored.";
            }
        }
        else if (project.IsDeleted)
        {
            project.IsDeleted = false;
            project.DeletedAtUtc = null;
            project.DeletedByUserId = null;
            project.DeleteReason = null;
            note = $"Parent project {project.JobNumber} was also restored.";
        }

        UpsertAsset(asset);
        await _db.SaveChangesAsync(cancellationToken);
        return new SelectiveRestoreResultDto("asset", asset.Id, asset.AssetTag, 1 + (note is null ? 0 : 1), note);
    }

    private async Task<SelectiveRestoreResultDto> RestoreDocumentFromBackupAsync(string backupPath, string documentId, CancellationToken cancellationToken)
    {
        var backupDocument = await LoadBackupDocumentAsync(backupPath, documentId, cancellationToken);
        if (backupDocument is null)
            throw new InvalidOperationException("Document was not found in the selected backup.");

        if (!string.IsNullOrWhiteSpace(backupDocument.FilePath))
        {
            var fullPath = Path.Combine(_environment.ContentRootPath, backupDocument.FilePath);
            if (!File.Exists(fullPath))
                throw new InvalidOperationException("The document record exists in the backup, but the physical file is not present on disk.");
        }

        var existing = await _db.Documents.IgnoreQueryFilters().FirstOrDefaultAsync(d => d.Id == documentId, cancellationToken);
        if (existing is null)
        {
            _db.Documents.Add(new DocumentEntity
            {
                Id = backupDocument.Id,
                Name = backupDocument.Name,
                Type = backupDocument.Type,
                LinkedTo = backupDocument.LinkedTo,
                UploadedAt = backupDocument.UploadedAt,
                FilePath = backupDocument.FilePath,
                ContentType = backupDocument.ContentType,
                FileSize = backupDocument.FileSize,
                CreatedBy = backupDocument.CreatedBy,
                Notes = backupDocument.Notes,
                CustomValuesJson = backupDocument.CustomValuesJson,
                DownloadUrl = backupDocument.DownloadUrl,
                IsDeleted = false,
            });
        }
        else
        {
            existing.Name = backupDocument.Name;
            existing.Type = backupDocument.Type;
            existing.LinkedTo = backupDocument.LinkedTo;
            existing.UploadedAt = backupDocument.UploadedAt;
            existing.FilePath = backupDocument.FilePath;
            existing.ContentType = backupDocument.ContentType;
            existing.FileSize = backupDocument.FileSize;
            existing.CreatedBy = backupDocument.CreatedBy;
            existing.Notes = backupDocument.Notes;
            existing.CustomValuesJson = backupDocument.CustomValuesJson;
            existing.DownloadUrl = backupDocument.DownloadUrl;
            existing.IsDeleted = false;
            existing.DeletedAtUtc = null;
            existing.DeletedByUserId = null;
            existing.DeleteReason = null;
        }

        await _db.SaveChangesAsync(cancellationToken);
        _searchIndexQueue.EnqueueLibraryDocument(documentId);
        return new SelectiveRestoreResultDto("document", backupDocument.Id, backupDocument.Name, 1, "Document metadata was restored from the selected backup.");
    }

    private void UpsertProject(ProjectEntity source)
    {
        var existing = _db.Projects.IgnoreQueryFilters().FirstOrDefault(p => p.Id == source.Id);
        if (existing is null)
        {
            _db.Projects.Add(CloneProject(source));
            return;
        }

        existing.CustomerName = source.CustomerName;
        existing.CustomerId = source.CustomerId;
        existing.SiteId = source.SiteId;
        existing.JobNumber = source.JobNumber;
        existing.PurchaseOrderNumber = source.PurchaseOrderNumber;
        existing.Description = source.Description;
        existing.StartDate = source.StartDate;
        existing.FinishDate = source.FinishDate;
        existing.Office = source.Office;
        existing.OfficeId = source.OfficeId;
        existing.Region = source.Region;
        existing.ProjectType = source.ProjectType;
        existing.Status = source.Status;
        existing.ApprovalDecision = source.ApprovalDecision;
        existing.IsInstallationProject = source.IsInstallationProject;
        existing.InstallationMode = source.InstallationMode;
        existing.WorkflowMode = source.WorkflowMode;
        existing.ProjectManager = source.ProjectManager;
        existing.ContractValue = source.ContractValue;
        existing.ProbabilityStage = source.ProbabilityStage;
        existing.ProductIds = source.ProductIds.ToList();
        existing.ProductFeatureValuesJson = source.ProductFeatureValuesJson;
        existing.TeamMemberIdsJson = source.TeamMemberIdsJson;
        existing.IsDeleted = false;
        existing.DeletedAtUtc = null;
        existing.DeletedByUserId = null;
        existing.DeleteReason = null;
    }

    private void UpsertInstallation(InstallationEntity source)
    {
        var existing = _db.Installations.IgnoreQueryFilters().FirstOrDefault(i => i.Id == source.Id);
        if (existing is null)
        {
            _db.Installations.Add(CloneInstallation(source));
            return;
        }

        existing.ProjectId = source.ProjectId;
        existing.InstallationNumber = source.InstallationNumber;
        existing.InstallationId = source.InstallationId;
        existing.InstallationName = source.InstallationName;
        existing.SiteLocation = source.SiteLocation;
        existing.SiteContactName = source.SiteContactName;
        existing.SiteContactPhone = source.SiteContactPhone;
        existing.SiteContactEmail = source.SiteContactEmail;
        existing.ScheduledStart = source.ScheduledStart;
        existing.ScheduledEnd = source.ScheduledEnd;
        existing.ActualStart = source.ActualStart;
        existing.ActualFinish = source.ActualFinish;
        existing.Status = source.Status;
        existing.AssignedTeam = source.AssignedTeam;
        existing.AssignedUsers = source.AssignedUsers.ToList();
        existing.Office = source.Office;
        existing.InstallerNotes = source.InstallerNotes;
        existing.CustomerSignOffDate = source.CustomerSignOffDate;
        existing.CustomerSignOffContact = source.CustomerSignOffContact;
        existing.MachineType = source.MachineType;
        existing.Pm1Serial = source.Pm1Serial;
        existing.Pm2Serial = source.Pm2Serial;
        existing.Pm3Serial = source.Pm3Serial;
        existing.Pm4Serial = source.Pm4Serial;
        existing.CustomFieldsJson = source.CustomFieldsJson;
        existing.IsDeleted = false;
        existing.DeletedAtUtc = null;
        existing.DeletedByUserId = null;
        existing.DeleteReason = null;
    }

    private void UpsertAsset(ProjectAssetEntity source)
    {
        var existing = _db.ProjectAssets.IgnoreQueryFilters().FirstOrDefault(a => a.Id == source.Id);
        if (existing is null)
        {
            _db.ProjectAssets.Add(CloneAsset(source));
            return;
        }

        existing.ProjectId = source.ProjectId;
        existing.ProductId = source.ProductId;
        existing.ProductConfigId = source.ProductConfigId;
        existing.WorkflowTemplateId = source.WorkflowTemplateId;
        existing.AssetTag = source.AssetTag;
        existing.AssetName = source.AssetName;
        existing.SerialNumber = source.SerialNumber;
        existing.AssetModel = source.AssetModel;
        existing.Manufacturer = source.Manufacturer;
        existing.Location = source.Location;
        existing.AssignedUserId = source.AssignedUserId;
        existing.Status = source.Status;
        existing.WorkOrderId = source.WorkOrderId;
        existing.Notes = source.Notes;
        existing.FeatureValuesJson = source.FeatureValuesJson;
        existing.IssuesJson = source.IssuesJson;
        existing.ConfigLabel = source.ConfigLabel;
        existing.InstalledAt = source.InstalledAt;
        existing.InstalledBy = source.InstalledBy;
        existing.AsBuiltJson = source.AsBuiltJson;
        existing.CreatedAt = source.CreatedAt;
        existing.UpdatedAt = source.UpdatedAt;
        existing.IsDeleted = false;
        existing.DeletedAtUtc = null;
        existing.DeletedByUserId = null;
        existing.DeleteReason = null;
    }

    private static ProjectEntity CloneProject(ProjectEntity source) => new()
    {
        Id = source.Id,
        CustomerName = source.CustomerName,
        CustomerId = source.CustomerId,
        SiteId = source.SiteId,
        JobNumber = source.JobNumber,
        PurchaseOrderNumber = source.PurchaseOrderNumber,
        Description = source.Description,
        StartDate = source.StartDate,
        FinishDate = source.FinishDate,
        Office = source.Office,
        OfficeId = source.OfficeId,
        Region = source.Region,
        ProjectType = source.ProjectType,
        Status = source.Status,
        ApprovalDecision = source.ApprovalDecision,
        IsInstallationProject = source.IsInstallationProject,
        InstallationMode = source.InstallationMode,
        WorkflowMode = source.WorkflowMode,
        ProjectManager = source.ProjectManager,
        ContractValue = source.ContractValue,
        ProbabilityStage = source.ProbabilityStage,
        ProductIds = source.ProductIds.ToList(),
        ProductFeatureValuesJson = source.ProductFeatureValuesJson,
        TeamMemberIdsJson = source.TeamMemberIdsJson,
        IsDeleted = false
    };

    private static InstallationEntity CloneInstallation(InstallationEntity source) => new()
    {
        Id = source.Id,
        ProjectId = source.ProjectId,
        InstallationNumber = source.InstallationNumber,
        InstallationId = source.InstallationId,
        InstallationName = source.InstallationName,
        SiteLocation = source.SiteLocation,
        SiteContactName = source.SiteContactName,
        SiteContactPhone = source.SiteContactPhone,
        SiteContactEmail = source.SiteContactEmail,
        ScheduledStart = source.ScheduledStart,
        ScheduledEnd = source.ScheduledEnd,
        ActualStart = source.ActualStart,
        ActualFinish = source.ActualFinish,
        Status = source.Status,
        AssignedTeam = source.AssignedTeam,
        AssignedUsers = source.AssignedUsers.ToList(),
        Office = source.Office,
        InstallerNotes = source.InstallerNotes,
        CustomerSignOffDate = source.CustomerSignOffDate,
        CustomerSignOffContact = source.CustomerSignOffContact,
        MachineType = source.MachineType,
        Pm1Serial = source.Pm1Serial,
        Pm2Serial = source.Pm2Serial,
        Pm3Serial = source.Pm3Serial,
        Pm4Serial = source.Pm4Serial,
        CustomFieldsJson = source.CustomFieldsJson,
        IsDeleted = false
    };

    private static ProjectAssetEntity CloneAsset(ProjectAssetEntity source) => new()
    {
        Id = source.Id,
        ProjectId = source.ProjectId,
        ProductId = source.ProductId,
        ProductConfigId = source.ProductConfigId,
        WorkflowTemplateId = source.WorkflowTemplateId,
        AssetTag = source.AssetTag,
        AssetName = source.AssetName,
        SerialNumber = source.SerialNumber,
        AssetModel = source.AssetModel,
        Manufacturer = source.Manufacturer,
        Location = source.Location,
        AssignedUserId = source.AssignedUserId,
        Status = source.Status,
        WorkOrderId = source.WorkOrderId,
        Notes = source.Notes,
        FeatureValuesJson = source.FeatureValuesJson,
        IssuesJson = source.IssuesJson,
        ConfigLabel = source.ConfigLabel,
        InstalledAt = source.InstalledAt,
        InstalledBy = source.InstalledBy,
        AsBuiltJson = source.AsBuiltJson,
        CreatedAt = source.CreatedAt,
        UpdatedAt = source.UpdatedAt,
        IsDeleted = false
    };

    private AppDbContext CreateBackupDbContext(string backupPath)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={backupPath}")
            .Options;

        return new AppDbContext(options);
    }

    private async Task<BackupDocumentRow?> LoadBackupDocumentAsync(string backupPath, string documentId, CancellationToken cancellationToken)
    {
        await using var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = backupPath, Mode = SqliteOpenMode.ReadOnly }.ToString());
        await connection.OpenAsync(cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = @"
SELECT Id, Name, Type, LinkedTo, UploadedAt, FilePath, ContentType, FileSize, CreatedBy, Notes, CustomValuesJson, DownloadUrl
FROM Documents
WHERE Id = @id
LIMIT 1;";
        command.Parameters.AddWithValue("@id", documentId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            return null;

        return new BackupDocumentRow(
            reader.GetString(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
            reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
            reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.IsDBNull(6) ? null : reader.GetString(6),
            reader.IsDBNull(7) ? null : reader.GetInt64(7),
            reader.IsDBNull(8) ? null : reader.GetString(8),
            reader.IsDBNull(9) ? null : reader.GetString(9),
            reader.IsDBNull(10) ? null : reader.GetString(10),
            reader.IsDBNull(11) ? null : reader.GetString(11)
        );
    }

    private static async Task<bool> TableHasColumnAsync(SqliteConnection connection, string tableName, string columnName, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = $"SELECT COUNT(*) FROM pragma_table_info('{tableName}') WHERE name = @columnName;";
        command.Parameters.AddWithValue("@columnName", columnName);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt64(result) > 0;
    }

    private static string? NormalizeEntityType(string? entityType)
    {
        var type = entityType?.Trim().ToLowerInvariant();
        return type switch
        {
            null or "" or "all" => null,
            "project" or "installation" or "asset" or "document" or "bomimportrun" => type == "bomimportrun" ? "bomImportRun" : type,
            _ => throw new InvalidOperationException("Unsupported entity type.")
        };
    }

    private sealed record BackupDocumentRow(
        string Id,
        string Name,
        string Type,
        string LinkedTo,
        string UploadedAt,
        string? FilePath,
        string? ContentType,
        long? FileSize,
        string? CreatedBy,
        string? Notes,
        string? CustomValuesJson,
        string? DownloadUrl
    );
}
