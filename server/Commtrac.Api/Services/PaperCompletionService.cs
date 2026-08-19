using System.Globalization;
using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services.Storage;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Services;

public sealed class PaperCompletionService
{
    public const string DocumentType = "Paper Completed Workflow";

    private readonly AppDbContext _db;
    private readonly IFileStorageService _files;
    private readonly ProjectLifecycleService _projectLifecycle;
    private readonly IDocumentSearchIndexQueue _searchIndexQueue;
    private static readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };

    public PaperCompletionService(
        AppDbContext db,
        IFileStorageService files,
        ProjectLifecycleService projectLifecycle,
        IDocumentSearchIndexQueue searchIndexQueue)
    {
        _db = db;
        _files = files;
        _projectLifecycle = projectLifecycle;
        _searchIndexQueue = searchIndexQueue;
    }

    public async Task<(bool Success, string? Error, PaperCompletionResult? Result)> RecordAsync(
        string assetId,
        IFormFile file,
        string format,
        bool acknowledged,
        bool waiveCustomerSignature,
        bool customerSignedOnPaper,
        bool installerSignedOnPaper,
        string? notes,
        string? actorUserId,
        string actorName)
    {
        if (!acknowledged)
        {
            return (false, "You must acknowledge that saving will close this asset workflow.", null);
        }

        if (file == null || file.Length == 0)
        {
            return (false, "A PDF or JSON file is required.", null);
        }

        var normalizedFormat = (format ?? string.Empty).Trim().ToLowerInvariant();
        if (normalizedFormat is not ("pdf" or "json"))
        {
            return (false, "Format must be pdf or json.", null);
        }

        if (!ValidateFileType(file, normalizedFormat, out var validationError))
        {
            return (false, validationError, null);
        }

        if (!installerSignedOnPaper)
        {
            return (false, "Installer sign-off on paper is required to close the asset.", null);
        }

        if (!waiveCustomerSignature && !customerSignedOnPaper)
        {
            return (false, "Confirm customer signed on paper, or waive the customer signature.", null);
        }

        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == assetId && !a.IsDeleted);
        if (asset is null)
        {
            return (false, "Asset not found.", null);
        }

        if (string.Equals(asset.Status, "Closed", StringComparison.OrdinalIgnoreCase))
        {
            return (false, "This asset is already closed.", null);
        }

        if (string.Equals(asset.Status, "Cancelled", StringComparison.OrdinalIgnoreCase))
        {
            return (false, "Cancelled assets cannot be closed via paper completion.", null);
        }

        string? jsonPayload = null;
        if (normalizedFormat == "json")
        {
            try
            {
                await using var stream = file.OpenReadStream();
                using var doc = await JsonDocument.ParseAsync(stream);
                jsonPayload = doc.RootElement.GetRawText();
            }
            catch (JsonException)
            {
                return (false, "The uploaded JSON file is not valid.", null);
            }
        }

        var now = DateTime.UtcNow;
        var runs = await _db.AssetWorkflowRuns
            .Where(r => r.AssetId == assetId)
            .OrderByDescending(r => r.StartedAt)
            .ToListAsync();

        if (runs.Any(IsTerminalSignedClosed))
        {
            return (false, "This asset already has a signed and closed workflow run.", null);
        }

        var run = runs.FirstOrDefault(r => !r.IsLocked)
            ?? runs.FirstOrDefault(r => r.IsLocked && r.SignatureStatus is "PendingInstaller" or "PendingCustomer" or "Declined");

        if (run is null)
        {
            run = await CreateMinimalRunAsync(asset, actorUserId, now);
        }

        run.IsLocked = true;
        run.Status = "Complete";
        run.CompletedAt ??= now;
        run.CompletedByName = actorName;
        run.UpdatedAt = now;
        run.InstallerSignedAt ??= now;

        if (waiveCustomerSignature)
        {
            run.SignatureStatus = "WaivedCustomer";
            run.CustomerSignedAt = null;
        }
        else
        {
            run.SignatureStatus = "Signed";
            run.CustomerSignedAt ??= now;
        }

        if (normalizedFormat == "json" && !string.IsNullOrWhiteSpace(jsonPayload))
        {
            TryApplyJsonPayload(run, jsonPayload);
        }

        var project = await _db.Projects.AsNoTracking().FirstOrDefaultAsync(p => p.Id == asset.ProjectId);
        var storedDoc = await SaveLibraryDocumentAsync(file, asset, project, run, actorName, notes, normalizedFormat);

        asset.Status = "Closed";
        asset.UpdatedAt = now;
        asset.InstalledAt ??= now;
        if (string.IsNullOrWhiteSpace(asset.InstalledBy))
        {
            asset.InstalledBy = actorName;
        }

        await _db.SaveChangesAsync();
        await _projectLifecycle.SyncFromAssetsAsync(asset.ProjectId, actorUserId, actorName, notifyStatusChange: true);
        _searchIndexQueue.EnqueueLibraryDocument(storedDoc.Id);

        return (true, null, new PaperCompletionResult(
            asset.Id,
            asset.Status,
            run.Id,
            run.SignatureStatus,
            storedDoc.Id,
            storedDoc.Name));
    }

    private static bool IsTerminalSignedClosed(AssetWorkflowRunEntity run)
    {
        if (!run.IsLocked) return false;
        if (string.Equals(run.SignatureStatus, "Signed", StringComparison.OrdinalIgnoreCase)) return true;
        if (string.Equals(run.SignatureStatus, "WaivedCustomer", StringComparison.OrdinalIgnoreCase)) return true;
        return run.CustomerSignedAt.HasValue
            && run.SignatureStatus is "Signed" or "Declined" or "WaivedCustomer";
    }

    private async Task<AssetWorkflowRunEntity> CreateMinimalRunAsync(
        ProjectAssetEntity asset,
        string? technicianUserId,
        DateTime now)
    {
        var assignment = await _db.AssetWorkflowAssignments
            .Where(a => a.AssetId == asset.Id)
            .OrderByDescending(a => a.AssignedAt)
            .FirstOrDefaultAsync();

        var configId = assignment?.WorkflowConfigId ?? asset.ProductConfigId ?? "paper-completion";
        var snapshot = "{}";
        var version = 1;

        if (!string.Equals(configId, "paper-completion", StringComparison.OrdinalIgnoreCase))
        {
            var config = await _db.WorkflowConfigs.FirstOrDefaultAsync(c => c.Id == configId);
            if (config is not null)
            {
                version = config.Version;
                snapshot = JsonSerializer.Serialize(new
                {
                    id = config.Id,
                    name = config.Name,
                    version = config.Version,
                    stepsJson = config.StepsJson,
                    mediaJson = config.MediaJson,
                    featureSelectionsJson = config.FeatureSelectionsJson,
                    snapshotAt = now,
                    source = "paper-completion",
                });
            }
        }

        var runCount = await _db.AssetWorkflowRuns
            .CountAsync(r => r.AssetId == asset.Id && r.WorkflowConfigId == configId);

        var run = new AssetWorkflowRunEntity
        {
            AssetId = asset.Id,
            WorkflowConfigId = configId,
            WorkflowVersion = version,
            WorkflowSnapshotJson = snapshot,
            Status = "InProgress",
            IsLocked = false,
            TechnicianUserId = technicianUserId,
            StepResultsJson = "[]",
            IssuesJson = "[]",
            RunNumber = runCount + 1,
            StartedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.AssetWorkflowRuns.Add(run);
        return run;
    }

    private static void TryApplyJsonPayload(AssetWorkflowRunEntity run, string jsonPayload)
    {
        try
        {
            using var doc = JsonDocument.Parse(jsonPayload);
            var root = doc.RootElement;
            if (root.TryGetProperty("run", out var runNode)
                && runNode.TryGetProperty("stepResultsJson", out var stepResults)
                && stepResults.ValueKind == JsonValueKind.String)
            {
                var value = stepResults.GetString();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    run.StepResultsJson = value;
                }
            }
            else if (root.TryGetProperty("stepResultsJson", out var directStepResults)
                && directStepResults.ValueKind == JsonValueKind.String)
            {
                var value = directStepResults.GetString();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    run.StepResultsJson = value;
                }
            }
        }
        catch
        {
            // Evidence file is still stored even if we cannot map fields.
        }
    }

    private async Task<DocumentEntity> SaveLibraryDocumentAsync(
        IFormFile file,
        ProjectAssetEntity asset,
        ProjectEntity? project,
        AssetWorkflowRunEntity run,
        string actorName,
        string? notes,
        string format)
    {
        var extension = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = format == "pdf" ? ".pdf" : ".json";
        }

        var storedName = $"{Guid.NewGuid()}{extension}";
        var relativePath = _files.BuildRelativePath("Storage", "Documents", storedName);
        await _files.SaveAsync(relativePath, file.OpenReadStream());

        var customValues = JsonSerializer.Serialize(new Dictionary<string, string?>
        {
            ["projectId"] = asset.ProjectId,
            ["jobNumber"] = project?.JobNumber,
            ["assetId"] = asset.Id,
            ["assetTag"] = asset.AssetTag,
            ["runId"] = run.Id,
            ["reportKind"] = "paper-completed-workflow",
            ["signatureStatus"] = run.SignatureStatus,
            ["format"] = format,
        });

        var doc = new DocumentEntity
        {
            Name = file.FileName,
            Type = DocumentType,
            LinkedTo = project?.JobNumber ?? asset.ProjectId,
            UploadedAt = nowIso(),
            FilePath = relativePath,
            ContentType = file.ContentType,
            FileSize = file.Length,
            CreatedBy = actorName,
            Notes = notes,
            CustomValuesJson = customValues,
        };
        _db.Documents.Add(doc);
        return doc;
    }

    private static string nowIso() =>
        DateTime.UtcNow.ToString("s", CultureInfo.InvariantCulture);

    private static bool ValidateFileType(IFormFile file, string format, out string? error)
    {
        var fileName = file.FileName ?? string.Empty;
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var contentType = (file.ContentType ?? string.Empty).ToLowerInvariant();

        if (format == "pdf")
        {
            if (extension == ".pdf" || contentType.Contains("pdf", StringComparison.Ordinal))
            {
                error = null;
                return true;
            }

            error = "Please upload a PDF file.";
            return false;
        }

        if (extension == ".json" || contentType.Contains("json", StringComparison.Ordinal))
        {
            error = null;
            return true;
        }

        error = "Please upload a JSON file.";
        return false;
    }
}

public sealed record PaperCompletionResult(
    string AssetId,
    string AssetStatus,
    string RunId,
    string SignatureStatus,
    string DocumentId,
    string DocumentName);
