using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Commtrac.Api.Services.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/workflow-configs")]
[Authorize]
public class WorkflowConfigsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IFileStorageService _files;
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    /// <summary>WF-6: the only schemaVersion this server currently accepts for the reusable
    /// workflow JSON export/import format (WorkflowExportDto). Bump alongside a real breaking
    /// shape change, never silently.</summary>
    private const int SupportedWorkflowExportSchemaVersion = 1;

    public WorkflowConfigsController(AppDbContext db, IFileStorageService files)
    {
        _db = db;
        _files = files;
    }

    private string WorkflowMediaDirectory(string workflowId)
        => _files.BuildRelativePath("Storage", "WorkflowMedia", workflowId);

    /// <summary>WF-3: deterministic, GUID-shaped id derived from a stable seed string — the same
    /// seed always produces the same id (so republishing with no feature/unit changes is
    /// byte-identical), distinct seeds practically never collide (SHA-256 truncated to the first
    /// 128 bits), and the shape matches the Guid.NewGuid() ids it replaces so nothing downstream
    /// that expects a GUID-looking id breaks.</summary>
    private static string DeterministicId(string seed)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(seed));
        return new Guid(hash[..16]).ToString();
    }

    /// <summary>Generator key format: feature:&lt;featureId&gt;:unit:&lt;unitIndex&gt;:&lt;stepType&gt;
    /// — one grouped step per physical unit, never split per dependency.</summary>
    private static string GeneratedStepId(string generatorKey) => DeterministicId($"step:{generatorKey}");

    /// <summary>Deterministic capture-field / input identity: featureId + unitIndex + dependencyId
    /// + fieldKey — distinguishes physical units so multiple units of the same feature/dependency
    /// never collide.</summary>
    private static string GeneratedFieldId(string featureId, int unitIndex, string dependencyId, string fieldKey)
        => DeterministicId($"field:{featureId}:unit:{unitIndex}:dep:{dependencyId}:key:{fieldKey}");

    // ── StepsJson shape compatibility ───────────────────────────────────────────────────────
    //
    // WorkflowConfig.StepsJson (and the identical value a run's WorkflowSnapshotJson.StepsJson
    // inherits verbatim at run-start) is valid in two shapes in real data:
    //   1. A bare steps array:              [ {...}, {...} ]
    //   2. A wrapped whole-workflow object: { "id", "name", "productId", "createdAt",
    //                                         "steps": [ {...}, {...} ], "media": [...] }
    // The frontend's own loader already tolerates both (WorkflowBuilder.tsx: Array.isArray(parsed)
    // ? parsed : Array.isArray(parsed?.steps) ? parsed.steps : ...); the backend previously assumed
    // shape 1 everywhere, throwing an unhandled JsonException (surfacing to clients as a generic
    // network failure) for any config actually stored in shape 2 — which real staging/production
    // data commonly is. ParseWorkflowSteps is the single tolerant reader for both shapes; every
    // call site that used to do `Deserialize<List<JsonElement>>(...StepsJson, JsonOpts)` directly
    // must go through this instead so there is exactly one place that understands the ambiguity.
    //
    // Read-only fix: this does not change what any operation WRITES back. Every write site in
    // this controller already serializes a bare `List<JsonElement>`/IEnumerable directly (Publish,
    // SyncFeatureSteps, ImportWorkflow), which always produces shape 1 — so a config's stored
    // shape naturally normalizes to the bare array over time as it's touched, without this fix
    // needing to rewrite anything itself.
    private sealed record StepsParseResult(bool Ok, List<JsonElement> Steps, string? Error)
    {
        public static StepsParseResult Success(List<JsonElement> steps) => new(true, steps, null);
        public static StepsParseResult Failure(string error) => new(false, new List<JsonElement>(), error);
    }

    private static StepsParseResult ParseWorkflowSteps(string? stepsJson)
    {
        if (string.IsNullOrWhiteSpace(stepsJson))
            return StepsParseResult.Success(new List<JsonElement>());

        JsonElement root;
        try
        {
            root = JsonSerializer.Deserialize<JsonElement>(stepsJson, JsonOpts);
        }
        catch (JsonException ex)
        {
            return StepsParseResult.Failure($"StepsJson is not valid JSON: {ex.Message}");
        }

        if (root.ValueKind == JsonValueKind.Array)
            return StepsParseResult.Success(root.EnumerateArray().ToList());

        if (root.ValueKind == JsonValueKind.Object)
        {
            if (!root.TryGetProperty("steps", out var stepsProp))
                return StepsParseResult.Failure("StepsJson object is missing a \"steps\" property.");
            if (stepsProp.ValueKind != JsonValueKind.Array)
                return StepsParseResult.Failure($"StepsJson object's \"steps\" property must be an array, got {stepsProp.ValueKind}.");
            return StepsParseResult.Success(stepsProp.EnumerateArray().ToList());
        }

        return StepsParseResult.Failure($"StepsJson root must be a JSON array or a wrapped object, got {root.ValueKind}.");
    }

    // ── Shared feature-generated step/field construction (Publish + WF-4 SyncFeatureSteps) ────

    private static Dictionary<string, bool> ParseInclusions(string? inclusionsJson) =>
        string.IsNullOrWhiteSpace(inclusionsJson) || inclusionsJson == "{}"
            ? new Dictionary<string, bool>()
            : JsonSerializer.Deserialize<Dictionary<string, bool>>(inclusionsJson, JsonOpts) ?? new();

    private static List<string> CaptureFieldKeysFor(FeatureDependencyEntity dep) =>
        string.IsNullOrWhiteSpace(dep.CaptureFieldsJson) || dep.CaptureFieldsJson == "[]"
            ? new List<string>()
            : JsonSerializer.Deserialize<List<string>>(dep.CaptureFieldsJson, JsonOpts) ?? new();

    /// <summary>The field key(s) a dependency contributes for a given generated stepType —
    /// one entry per capture-field key for "installation" (inventory), a single fixed "qty" entry
    /// for "data-collection" (non-inventory). Shared by generation and WF-4 diffing so both always
    /// agree on which deterministic field ids a dependency can ever produce.</summary>
    private static List<string> FieldKeysFor(FeatureDependencyEntity dep, string stepType) =>
        stepType == "installation" ? CaptureFieldKeysFor(dep) : new List<string> { "qty" };

    private static string CaptureFieldLabel(string key) => key switch
    {
        "serialNo"   => "Serial Number",
        "firmware"   => "Firmware Version",
        "ipAddress"  => "IP Address",
        "macAddress" => "MAC Address",
        "model"      => "Model",
        "location"   => "Location",
        _            => key,
    };

    /// <summary>Product/Feature master P/N — reference-only, visible to the worker on every
    /// generated installation step but never technician-editable. Precedence matches the rest of
    /// the app (Settings → Features "P/N" column, captureSpreadsheet.ts): alternativePartNumber
    /// first, manufacturerPartNumber as fallback.</summary>
    private static string? ResolvePartNumber(FeatureEntity feature) =>
        !string.IsNullOrWhiteSpace(feature.AlternativePartNumber) ? feature.AlternativePartNumber
        : !string.IsNullOrWhiteSpace(feature.ManufacturerPartNumber) ? feature.ManufacturerPartNumber
        : null;

    private static string PartNumberFieldId(string featureId, int unitIndex) =>
        DeterministicId($"field:{featureId}:unit:{unitIndex}:partNumber");

    private static object BuildPartNumberFieldObject(string featureId, int unitIndex, string partNumber) => new
    {
        id = PartNumberFieldId(featureId, unitIndex),
        key = "partNumber",
        label = "Part Number",
        type = "text",
        required = false,
        featureId,
        readOnly = true,
        value = partNumber,
    };

    private static object BuildFieldObjectFor(string featureId, int unitIndex, FeatureDependencyEntity dep, string fieldKey, string stepType) =>
        stepType == "installation"
            ? new
            {
                id = GeneratedFieldId(featureId, unitIndex, dep.Id, fieldKey),
                key = fieldKey,
                label = CaptureFieldLabel(fieldKey),
                type = "text",
                required = true,
                featureId,
            }
            : new
            {
                id = GeneratedFieldId(featureId, unitIndex, dep.Id, fieldKey),
                type = "number",
                label = $"Actual qty — {dep.Name} ({(dep.Unit ?? "units")})",
                required = true,
                featureId,
            };

    private static object BuildInstallationStepObject(
        string featureId, string featureName, int unitIndex, int order, List<FeatureDependencyEntity> inventoryDeps, string? partNumber = null)
    {
        var generatorKey = $"feature:{featureId}:unit:{unitIndex}:installation";
        var cfList = new List<object>();
        if (!string.IsNullOrWhiteSpace(partNumber))
            cfList.Add(BuildPartNumberFieldObject(featureId, unitIndex, partNumber));
        foreach (var dep in inventoryDeps)
            foreach (var key in CaptureFieldKeysFor(dep))
                cfList.Add(BuildFieldObjectFor(featureId, unitIndex, dep, key, "installation"));

        var depNames = string.Join(", ", inventoryDeps.Select(d => d.Name));
        return new
        {
            id = GeneratedStepId(generatorKey),
            order,
            title = $"{featureName} {unitIndex} — Installation",
            description = $"Capture details for {depNames} ({featureName} {unitIndex}).",
            overrideInReport = false,
            overrideReportText = "",
            includeDescriptionInReport = true,
            mediaIds = Array.Empty<string>(),
            decisionsEnabled = false,
            decisions = Array.Empty<object>(),
            inputs = Array.Empty<object>(),
            nextStepId = (string?)null,
            captureFields = cfList,
            stepType = "installation",
            stepFeatureId = featureId,
            stepUnitIndex = unitIndex,
            stepOrigin = "feature-generated",
            generatorKey,
            // Legacy shape (dependencyId, singular) kept for back-compat with any reader written
            // against the pre-WF-3 one-step-per-dependency shape (e.g. captureSpreadsheet.ts's
            // findDependencyCaptureValue); dependencyIds is the accurate superset now that a
            // unit's step can group several deps.
            bomSource = new
            {
                dependencyId = inventoryDeps[0].Id,
                dependencyIds = inventoryDeps.Select(d => d.Id).ToList(),
                featureId,
                isInventory = true,
            },
        };
    }

    private static object BuildDataCollectionStepObject(
        string featureId, string featureName, int unitIndex, int order, List<FeatureDependencyEntity> nonInventoryDeps)
    {
        var generatorKey = $"feature:{featureId}:unit:{unitIndex}:data-collection";
        var inputs = nonInventoryDeps.Select(dep => BuildFieldObjectFor(featureId, unitIndex, dep, "qty", "data-collection")).ToList();

        var depSummary = string.Join(", ", nonInventoryDeps.Select(d =>
            $"{d.Name} (Expected: {d.DefaultQty}{(d.Unit != null ? " " + d.Unit : "")})"));
        return new
        {
            id = GeneratedStepId(generatorKey),
            order,
            title = $"{featureName} {unitIndex} — Data Collection",
            description = $"Confirm quantities used for {featureName} {unitIndex}: {depSummary}.",
            overrideInReport = false,
            overrideReportText = "",
            includeDescriptionInReport = true,
            mediaIds = Array.Empty<string>(),
            decisionsEnabled = false,
            decisions = Array.Empty<object>(),
            inputs,
            nextStepId = (string?)null,
            captureFields = Array.Empty<object>(),
            stepType = "data-collection",
            stepFeatureId = featureId,
            stepUnitIndex = unitIndex,
            stepOrigin = "feature-generated",
            generatorKey,
            bomSource = new
            {
                dependencyId = nonInventoryDeps[0].Id,
                dependencyIds = nonInventoryDeps.Select(d => d.Id).ToList(),
                featureId,
                isInventory = false,
            },
        };
    }

    /// <summary>Defense-in-depth for the media routes only. mediaId is always a
    /// server-generated GUID (Guid.TryParse accepts both hyphenated and "N" formats
    /// used across this codebase), so it's validated strictly.</summary>
    private static bool IsValidMediaId(string? value)
        => !string.IsNullOrWhiteSpace(value) && Guid.TryParse(value, out _);

    /// <summary>Workflow config ids are normally GUIDs but at least one legacy seeded
    /// config uses a non-GUID id ("wf-chambers-default", StrataNgoSeeder.cs) — so this
    /// is a charset allowlist rather than a strict GUID check, which still rejects "..",
    /// "/", "\", and any encoded traversal fragment before it reaches path construction.</summary>
    private static bool IsPathSafeConfigId(string? value)
        => !string.IsNullOrWhiteSpace(value)
        && value.Length <= 200
        && value.All(c => char.IsLetterOrDigit(c) || c is '-' or '_');

    private static WorkflowConfigDto ToDto(WorkflowConfigEntity e) => new(
        e.Id, e.ProductId, e.Name, e.DisplayName, e.ConfigType, e.WorkflowTypeId, e.Status, e.Version,
        e.TemplateSourceId, e.StepsJson, e.MediaJson, e.FeatureSelectionsJson,
        e.Notes, e.CreatedBy, e.CreatedAt, e.UpdatedAt
    );

    // GET api/workflow-configs/by-product/{productId}?status=Published
    [HttpGet("by-product/{productId}")]
    public async Task<IActionResult> ListByProduct(string productId, [FromQuery] string? status = null)
    {
        var q = _db.WorkflowConfigs.Where(c => c.ProductId == productId);
        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(c => c.Status == status);
        var list = await q.OrderByDescending(c => c.UpdatedAt).ToListAsync();
        return Ok(list.Select(ToDto));
    }

    // GET api/workflow-configs/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var c = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (c is null) return NotFound();
        return Ok(ToDto(c));
    }

    // POST api/workflow-configs
    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Create([FromBody] UpsertWorkflowConfigRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))    return BadRequest(new { message = "Name is required." });
        if (string.IsNullOrWhiteSpace(req.ProductId)) return BadRequest(new { message = "ProductId is required." });

        var createdBy = User.Identity?.Name ?? User.FindFirst("email")?.Value;
        var entity = new WorkflowConfigEntity
        {
            Id                    = Guid.NewGuid().ToString(),
            ProductId             = req.ProductId!,
            Name                  = req.Name!,
            DisplayName           = req.DisplayName,
            ConfigType            = req.ConfigType,
            WorkflowTypeId        = string.IsNullOrWhiteSpace(req.WorkflowTypeId) ? null : req.WorkflowTypeId,
            Status                = "Draft",
            Version               = 1,
            StepsJson             = req.StepsJson ?? "[]",
            MediaJson             = req.MediaJson ?? "[]",
            FeatureSelectionsJson = req.FeatureSelectionsJson ?? "[]",
            Notes                 = req.Notes,
            CreatedBy             = createdBy,
            CreatedAt             = DateTime.UtcNow,
            UpdatedAt             = DateTime.UtcNow,
        };
        _db.WorkflowConfigs.Add(entity);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, ToDto(entity));
    }

    // PUT api/workflow-configs/{id}  — only editable when Draft
    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Update(string id, [FromBody] UpsertWorkflowConfigRequest req)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();
        if (entity.Status != "Draft")
            return BadRequest(new { message = "Only Draft configurations can be edited. Clone this config to create a new version." });

        if (req.Name is not null)                  entity.Name                  = req.Name;
        if (req.DisplayName is not null)           entity.DisplayName           = req.DisplayName;
        if (req.ConfigType is not null)            entity.ConfigType            = req.ConfigType;
        if (req.WorkflowTypeId is not null)        entity.WorkflowTypeId        = string.IsNullOrWhiteSpace(req.WorkflowTypeId) ? null : req.WorkflowTypeId;
        if (req.Notes is not null)                 entity.Notes                 = req.Notes;
        if (req.StepsJson is not null)             entity.StepsJson             = req.StepsJson;
        if (req.MediaJson is not null)             entity.MediaJson             = req.MediaJson;
        if (req.FeatureSelectionsJson is not null) entity.FeatureSelectionsJson = req.FeatureSelectionsJson;
        entity.UpdatedAt             = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    // POST api/workflow-configs/{id}/publish
    [HttpPost("{id}/publish")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Publish(string id)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();
        if (entity.Status == "Archived")
            return BadRequest(new { message = "Archived configurations cannot be published." });

        if (string.IsNullOrWhiteSpace(entity.WorkflowTypeId) && !string.IsNullOrWhiteSpace(entity.ConfigType))
        {
            var configType = entity.ConfigType.Trim();
            entity.WorkflowTypeId = await _db.WorkflowTypes
                .Where(t => t.IsActive && t.Name == configType)
                .Select(t => t.Id)
                .FirstOrDefaultAsync();
        }

        if (string.IsNullOrWhiteSpace(entity.WorkflowTypeId))
        {
            return BadRequest(new
            {
                message = "A workflow type is required before publishing. Select one in the publish dialog.",
            });
        }

        var workflowTypeActive = await _db.WorkflowTypes.AnyAsync(t => t.Id == entity.WorkflowTypeId && t.IsActive);
        if (!workflowTypeActive)
        {
            return BadRequest(new { message = "The selected workflow type is inactive or does not exist." });
        }

        // ── Inject BOM steps from WorkflowConfigFeatures ──────────────────────
        var configFeatures = await _db.WorkflowConfigFeatures
            .Where(f => f.WorkflowConfigId == id)
            .OrderBy(f => f.SortOrder)
            .ToListAsync();

        if (configFeatures.Count > 0)
        {
            // Load the current steps array — tolerant of both real StepsJson shapes.
            var parsedSteps = ParseWorkflowSteps(entity.StepsJson);
            if (!parsedSteps.Ok)
                return BadRequest(new { message = $"Could not read this workflow's steps: {parsedSteps.Error}" });
            var steps = parsedSteps.Steps;

            // Remove any previously-injected BOM steps (safe re-publish guard) BEFORE computing
            // maxOrder — otherwise every republish (even with zero feature/quantity changes) would
            // keep pushing nextOrder past the previous generation's own order values, breaking
            // WF-3's "unchanged publish is byte-identical" guarantee.
            steps = steps.Where(s =>
                !(s.TryGetProperty("bomSource", out _))).ToList();

            // Determine highest surviving (custom) step's order value
            int maxOrder = 0;
            foreach (var s in steps)
                if (s.TryGetProperty("order", out var ordProp) && ordProp.TryGetInt32(out var ord))
                    if (ord > maxOrder) maxOrder = ord;

            int nextOrder = maxOrder + 1;

            foreach (var cf in configFeatures)
            {
                // Load the feature first — needed both for the dependency-having path (name) and
                // the dependency-less fallback below (IsInventory/CaptureFieldsJson/P-N).
                var feature = await _db.Features.FirstOrDefaultAsync(f => f.Id == cf.FeatureId);
                if (feature is null) continue;

                var allDeps = await _db.FeatureDependencies
                    .Where(d => d.FeatureId == cf.FeatureId)
                    .OrderBy(d => d.SortOrder)
                    .ToListAsync();

                List<FeatureDependencyEntity> inventoryDeps, nonInventoryDeps;

                if (allDeps.Count > 0)
                {
                    // Real Dependencies exist — per-dependency inclusion toggles decide what
                    // generates. Unchanged pre-existing behavior.
                    var inclusions = ParseInclusions(cf.InclusionsJson);
                    if (!inclusions.Any(kv => kv.Value)) continue; // nothing included

                    var includedIds = inclusions.Where(kv => kv.Value).Select(kv => kv.Key).ToHashSet();
                    inventoryDeps = allDeps.Where(d => d.IsInventory && includedIds.Contains(d.Id)).ToList();
                    nonInventoryDeps = allDeps.Where(d => !d.IsInventory && includedIds.Contains(d.Id)).ToList();
                }
                else if (feature.IsInventory && !string.IsNullOrWhiteSpace(feature.CaptureFieldsJson) && feature.CaptureFieldsJson != "[]")
                {
                    // No Dependencies configured — fall back to the Feature's own captureFields,
                    // the same synthetic-dependency fallback ReconcileFeatureStepsAsync uses (see
                    // its own doc comment for the full rationale). Driven purely by cf.Quantity,
                    // no inclusion toggle to check.
                    inventoryDeps = new List<FeatureDependencyEntity>
                    {
                        new FeatureDependencyEntity
                        {
                            Id = feature.Id, FeatureId = feature.Id, Name = feature.Name,
                            IsInventory = true, CaptureFieldsJson = feature.CaptureFieldsJson, SortOrder = 0,
                        },
                    };
                    nonInventoryDeps = new List<FeatureDependencyEntity>();
                }
                else
                {
                    continue; // nothing configured to generate for this feature
                }

                var partNumber = ResolvePartNumber(feature);

                // WF-3: unroll one step per physical unit (1-based stepUnitIndex, matching the
                // app-wide convention already used by WorkflowBuilder's manual step templates —
                // see buildStepTemplate in WorkflowBuilder.tsx). Dependencies of the same stepType
                // never split a unit's step — they group into that unit's single generated step
                // (see the WF-3 plan: "Do not split a grouped feature/unit step into separate
                // steps merely because it has multiple dependencies").
                for (var unitIndex = 1; unitIndex <= cf.Quantity; unitIndex++)
                {
                    if (inventoryDeps.Count > 0)
                    {
                        var stepObj = BuildInstallationStepObject(cf.FeatureId, feature.Name, unitIndex, nextOrder++, inventoryDeps, partNumber);
                        steps.Add(JsonSerializer.SerializeToElement(stepObj, JsonOpts));
                    }

                    if (nonInventoryDeps.Count > 0)
                    {
                        var stepObj = BuildDataCollectionStepObject(cf.FeatureId, feature.Name, unitIndex, nextOrder++, nonInventoryDeps);
                        steps.Add(JsonSerializer.SerializeToElement(stepObj, JsonOpts));
                    }
                }
            }

            entity.StepsJson = JsonSerializer.Serialize(steps, JsonOpts);
        }

        entity.Status    = "Published";
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    // ── WF-4: Sync Feature Steps ────────────────────────────────────────────────

    /// <summary>Desired state for one (featureId, unitIndex, stepType) generated step — the
    /// currently-included dependencies that should populate it, plus every dependency of that
    /// inventory-type on the feature (used to identify stale fields safe to remove).</summary>
    private sealed record DesiredUnitStep(
        string GeneratorKey, string StepType, string FeatureId, string FeatureName, int UnitIndex,
        List<FeatureDependencyEntity> IncludedDeps, List<FeatureDependencyEntity> AllDepsOfType,
        /// <summary>Product/Feature master P/N, "installation" stepType only — always desired
        /// once configured (see ComputeFieldDiff), never a removal candidate.</summary>
        string? PartNumber = null);

    private sealed record FieldDiff(
        string ArrayProp, List<(string Id, object Field)> ToAdd, HashSet<string> ToRemoveIds,
        /// <summary>Fields whose id is unchanged but whose content must be refreshed in place —
        /// currently only the P/N reference field's value. Applied unconditionally by
        /// ApplyFieldDiff, never gated by applyRemovals: overwriting a read-only reference value
        /// can never discard technician-entered data, unlike removing a field outright.</summary>
        List<(string Id, object Field)> ToUpdateInPlace);

    /// <summary>Shape of the outer run snapshot object built in AssetWorkflowRunsController's
    /// start-run action — its StepsJson property is itself a still-serialized JSON string (the
    /// frozen WorkflowConfig.StepsJson at run-start), not a nested array, so reading it is a
    /// two-stage parse.</summary>
    private sealed record RunSnapshotRef(string? StepsJson);

    /// <summary>Computes which fields an existing generated step is missing (toAdd) and which of
    /// its existing fields are now stale (toRemoveIds) — never touching a field whose id isn't
    /// provably derivable from this exact (featureId, unitIndex, dependencyId, fieldKey) formula
    /// for THIS feature, so a manually-added/unknown field is never a candidate for removal.</summary>
    private static FieldDiff ComputeFieldDiff(JsonElement existingStep, DesiredUnitStep plan)
    {
        var arrayProp = plan.StepType == "installation" ? "captureFields" : "inputs";
        var existingArray = existingStep.TryGetProperty(arrayProp, out var arr)
            ? arr.EnumerateArray().ToList() : new List<JsonElement>();
        var existingIds = existingArray.Select(e => e.GetProperty("id").GetString() ?? "").ToHashSet();

        var toAdd = new List<(string Id, object Field)>();
        var toUpdateInPlace = new List<(string Id, object Field)>();
        var pnRemovableIds = new HashSet<string>();

        // Product/Feature master P/N — kept synchronized with Product master on every Sync, the
        // same as any other master-data-derived field:
        //   - configured, not yet present  -> add (also how a cleared-then-restored P/N comes
        //     back, deterministically, since PartNumberFieldId depends only on
        //     featureId/unitIndex, never on the value itself)
        //   - configured, present, value unchanged -> untouched
        //   - configured, present, value changed    -> update in place (same id, fresh value;
        //     never run-safety gated — refreshing a read-only reference value can't discard a
        //     technician's already-recorded answer, unlike removing a field outright)
        //   - cleared, still present -> removal candidate, run-safety gated like any other field
        //     removal (see pnRemovableIds below) — a stale P/N must never linger in the workflow
        if (plan.StepType == "installation")
        {
            var pnFieldId = PartNumberFieldId(plan.FeatureId, plan.UnitIndex);
            var existingPnField = existingArray.FirstOrDefault(e =>
                e.TryGetProperty("id", out var idProp) && idProp.GetString() == pnFieldId);
            var hasExistingPn = existingIds.Contains(pnFieldId);

            if (!string.IsNullOrWhiteSpace(plan.PartNumber))
            {
                if (!hasExistingPn)
                {
                    toAdd.Add((pnFieldId, BuildPartNumberFieldObject(plan.FeatureId, plan.UnitIndex, plan.PartNumber)));
                }
                else
                {
                    var existingValue = existingPnField.TryGetProperty("value", out var valueProp) ? valueProp.GetString() : null;
                    if (existingValue != plan.PartNumber)
                        toUpdateInPlace.Add((pnFieldId, BuildPartNumberFieldObject(plan.FeatureId, plan.UnitIndex, plan.PartNumber)));
                }
            }
            else if (hasExistingPn)
            {
                pnRemovableIds.Add(pnFieldId);
            }
        }

        foreach (var dep in plan.IncludedDeps)
            foreach (var fieldKey in FieldKeysFor(dep, plan.StepType))
            {
                var fid = GeneratedFieldId(plan.FeatureId, plan.UnitIndex, dep.Id, fieldKey);
                if (!existingIds.Contains(fid))
                    toAdd.Add((fid, BuildFieldObjectFor(plan.FeatureId, plan.UnitIndex, dep, fieldKey, plan.StepType)));
            }

        // Removal universe, case A: only ids derivable from a dependency of this feature/type that
        // is no longer included at all, plus the P/N reference field id when Product master has
        // been cleared (pnRemovableIds, computed above). Anything else present in the array (a
        // manual field, or a field this formula could never have produced) is never a removal
        // candidate.
        var removableIds = new HashSet<string>(pnRemovableIds);
        foreach (var dep in plan.AllDepsOfType)
        {
            if (plan.IncludedDeps.Any(d => d.Id == dep.Id)) continue;
            foreach (var fieldKey in FieldKeysFor(dep, plan.StepType))
                removableIds.Add(GeneratedFieldId(plan.FeatureId, plan.UnitIndex, dep.Id, fieldKey));
        }

        // Removal universe, case B ("installation" only): a dependency that is STILL included can
        // itself have its own capture-field key list shrink (e.g. the synthetic Feature.captureFields
        // fallback dependency, or an ordinary dependency whose CaptureFieldsJson was edited in
        // Settings) — case A alone misses this, since the dependency was never excluded. Verify
        // each existing field's own "key" against a recomputed id for one of its included
        // dependencies: only an EXACT id match proves this exact field was produced by this exact
        // (featureId, unitIndex, dependencyId, key) formula, so a manually-added field (random
        // uid(), never matching the deterministic hash) can never qualify. The P/N reference field
        // is excluded here — its own removal/update is computed separately above.
        if (plan.StepType == "installation")
        {
            foreach (var existing in existingArray)
            {
                if (!existing.TryGetProperty("key", out var keyProp)) continue;
                var key = keyProp.GetString();
                if (key is null || key == "partNumber") continue;
                var eid = existing.GetProperty("id").GetString() ?? "";
                foreach (var dep in plan.IncludedDeps)
                {
                    if (GeneratedFieldId(plan.FeatureId, plan.UnitIndex, dep.Id, key) != eid) continue;
                    if (!FieldKeysFor(dep, plan.StepType).Contains(key))
                        removableIds.Add(eid);
                }
            }
        }

        var toRemoveIds = existingIds.Intersect(removableIds).ToHashSet();

        return new FieldDiff(arrayProp, toAdd, toRemoveIds, toUpdateInPlace);
    }

    /// <summary>Applies a FieldDiff to an existing step, preserving every other property verbatim
    /// (title, description, mediaIds, decisions, overrideInReport/overrideReportText — any custom
    /// augmentation an admin attached after generation). Additions always apply; in-place updates
    /// (currently only a changed P/N value) always apply too — never run-safety gated, since
    /// refreshing a read-only reference value can't discard a technician's already-recorded
    /// answer; removals apply only when applyRemovals is true (the caller has already confirmed
    /// it's run-safe).</summary>
    private static JsonElement ApplyFieldDiff(JsonElement existingStep, FieldDiff diff, bool applyRemovals, DesiredUnitStep plan)
    {
        var existingArray = existingStep.TryGetProperty(diff.ArrayProp, out var arr)
            ? arr.EnumerateArray().ToList() : new List<JsonElement>();
        var updates = diff.ToUpdateInPlace.ToDictionary(u => u.Id, u => u.Field);

        var kept = existingArray
            .Where(e => !(applyRemovals && diff.ToRemoveIds.Contains(e.GetProperty("id").GetString() ?? "")))
            .Select(e =>
            {
                var id = e.GetProperty("id").GetString() ?? "";
                return updates.TryGetValue(id, out var replacement) ? replacement : (object)e;
            })
            .ToList();
        kept.AddRange(diff.ToAdd.Select(t => t.Field));

        var newBomSource = new
        {
            dependencyId = plan.IncludedDeps.Count > 0 ? plan.IncludedDeps[0].Id : null,
            dependencyIds = plan.IncludedDeps.Select(d => d.Id).ToList(),
            featureId = plan.FeatureId,
            isInventory = plan.StepType == "installation",
        };

        return WithProperties(existingStep, new Dictionary<string, object?>
        {
            [diff.ArrayProp] = kept,
            ["bomSource"] = newBomSource,
        });
    }

    /// <summary>Returns a copy of a step JsonElement with the given properties replaced (or
    /// added) and every other property preserved verbatim — the mechanism that lets an "updated"
    /// step keep any custom augmentation (title/description/media/decisions/report overrides) an
    /// admin attached after it was first generated.</summary>
    private static JsonElement WithProperties(JsonElement original, Dictionary<string, object?> overrides)
    {
        var dict = new Dictionary<string, object?>();
        foreach (var prop in original.EnumerateObject())
            dict[prop.Name] = prop.Value;
        foreach (var kv in overrides)
            dict[kv.Key] = kv.Value;
        return JsonSerializer.SerializeToElement(dict, JsonOpts);
    }

    /// <summary>Builds a result item. appliedFieldIds/blockedFieldIds make a partially-applied
    /// item self-describing: the step's own fields above (StepId/Title/etc.) already reflect the
    /// CURRENT state (with appliedFieldIds already applied), so this never represents a
    /// partially-changed step as if it were untouched.</summary>
    private static SyncFeatureStepItemDto ToResultItem(
        JsonElement step,
        List<SyncFeatureStepBlockingRunDto>? blockingRuns,
        List<string>? appliedFieldIds = null,
        List<string>? blockedFieldIds = null) => new(
        StepId: step.TryGetProperty("id", out var id) ? id.GetString() ?? "" : "",
        GeneratorKey: step.TryGetProperty("generatorKey", out var gk) ? gk.GetString() ?? "" : "",
        FeatureId: step.TryGetProperty("stepFeatureId", out var fid) ? fid.GetString() ?? "" : "",
        UnitIndex: step.TryGetProperty("stepUnitIndex", out var ui) && ui.TryGetInt32(out var uiv) ? uiv : 0,
        StepType: step.TryGetProperty("stepType", out var st) ? st.GetString() ?? "" : "",
        Title: step.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "",
        BlockingRuns: blockingRuns,
        AppliedFieldIds: appliedFieldIds is { Count: > 0 } ? appliedFieldIds : null,
        BlockedFieldIds: blockedFieldIds is { Count: > 0 } ? blockedFieldIds : null
    );

    /// <summary>WF-4 run-safety guard — approved policy: block a generated-step removal whenever
    /// any persisted, unlocked AssetWorkflowRun for this workflow config still carries that step in
    /// its immutable WorkflowSnapshotJson, regardless of whether a StepResultsJson value has been
    /// recorded for it yet. AssetWorkflowRunEntity.WorkflowSnapshotJson is a write-once copy taken
    /// at run creation (see Entities.cs, and the snapshot's construction in
    /// AssetWorkflowRunsController) — its own `stepsJson` property is itself a still-serialized
    /// JSON string (the frozen WorkflowConfig.StepsJson at that moment), not a nested array, hence
    /// the two-stage parse below. Scoped to runs of THIS workflow config only. A Complete/locked
    /// run is read-only and excluded — it can't be affected by anything this endpoint does.
    ///
    /// Server-only limitation (accepted, documented here rather than silently assumed away): a run
    /// that exists only in a device's local IndexedDB offline queue, not yet synced to this server,
    /// is invisible to this query by construction — there is no request this endpoint could make to
    /// observe it. It becomes protected by this same guard the moment it does sync and gets a
    /// persisted, non-locked AssetWorkflowRun row.</summary>
    private async Task<List<SyncFeatureStepBlockingRunDto>> FindBlockingRunsAsync(string workflowConfigId, string stepId)
    {
        var candidates = await _db.AssetWorkflowRuns
            .Where(r => r.WorkflowConfigId == workflowConfigId && !r.IsLocked)
            .Select(r => new { r.Id, r.AssetId, r.WorkflowSnapshotJson })
            .ToListAsync();

        var blocking = new List<SyncFeatureStepBlockingRunDto>();
        foreach (var run in candidates)
        {
            if (SnapshotContainsStep(run.WorkflowSnapshotJson, stepId))
                blocking.Add(new SyncFeatureStepBlockingRunDto(run.Id, run.AssetId));
        }
        return blocking;
    }

    private static bool SnapshotContainsStep(string? snapshotJson, string stepId)
    {
        if (string.IsNullOrWhiteSpace(snapshotJson)) return false;
        try
        {
            var outer = JsonSerializer.Deserialize<RunSnapshotRef>(snapshotJson, JsonOpts);
            if (string.IsNullOrWhiteSpace(outer?.StepsJson)) return false;
            // A run's snapshot inherits WorkflowConfig.StepsJson verbatim at run-start
            // (AssetWorkflowRunsController), so outer.StepsJson carries the identical shape
            // ambiguity — tolerate both via ParseWorkflowSteps. Previously a wrapped-shape
            // snapshot threw here and was swallowed by the catch below, silently returning false
            // (not blocking) — a run-safety false negative, not merely a crash — instead of
            // correctly detecting that the step is genuinely still referenced.
            var parsed = ParseWorkflowSteps(outer.StepsJson);
            if (!parsed.Ok) return false;
            return parsed.Steps.Any(s => s.TryGetProperty("id", out var idProp) && idProp.GetString() == stepId);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// WF-4: non-destructive reconciliation of stepOrigin: "feature-generated" steps against the
    /// config's current WorkflowConfigFeature/FeatureDependency state. Deliberately a separate
    /// action from Publish() (which still does a full strip-and-regenerate on every call) — this
    /// one only ever adds a step it can prove is newly desired, or surgically updates/removes
    /// generated content it can prove is no longer desired, matched by generatorKey. It NEVER
    /// touches a step whose stepOrigin isn't "feature-generated" — preparation, SAT/commissioning,
    /// inspection, return-to-service, report-configuration, manual, and imported steps are always
    /// preserved untouched, verbatim.
    ///
    /// Partial application: every safe change (all additions; any step needing no removal) applies
    /// unconditionally. A destructive change (whole-step removal, or removing a stale field from an
    /// otherwise-updated step) is independently subject to FindBlockingRunsAsync — one blocked
    /// removal never blocks any other item in the same sync. The whole result (added/updated/
    /// removed/unchanged/blocked steps) is computed in memory first and written back in a single
    /// StepsJson update + SaveChangesAsync, so this partial application is fully transactional:
    /// either the entire computed-safe result is persisted, or (on any DB error) none of it is —
    /// there is no intermediate half-applied state on disk.
    /// </summary>
    [HttpPost("{id}/sync-feature-steps")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> SyncFeatureSteps(string id)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();
        if (entity.Status == "Archived")
            return BadRequest(new { message = "Archived configurations cannot be synced." });

        // Recomputed from scratch here, every time — this action never accepts or trusts a
        // client-cached preview result, since run/config state can change between a preview call
        // and this confirmation.
        var (ok, error, result, finalSteps) = await ReconcileFeatureStepsAsync(id, entity.StepsJson);
        if (!ok)
            return BadRequest(new { message = $"Could not read this workflow's steps: {error}" });

        entity.StepsJson = JsonSerializer.Serialize(finalSteps, JsonOpts);
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(result);
    }

    /// <summary>
    /// WF-5: preview-only. Runs the exact same ReconcileFeatureStepsAsync used by
    /// POST {id}/sync-feature-steps below — same diff algorithm, same run-safety checks
    /// (FindBlockingRunsAsync) — but never assigns entity.StepsJson and never calls
    /// SaveChangesAsync, so nothing this action computes is persisted. There are deliberately not
    /// two diff engines: this and the apply action share one implementation, so they can never
    /// drift, and a client can never evaluate run-safety itself (it has no visibility into
    /// AssetWorkflowRun data) — only the server can produce an authoritative preview.
    /// </summary>
    [HttpPost("{id}/sync-feature-steps/preview")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> PreviewSyncFeatureSteps(string id)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();
        if (entity.Status == "Archived")
            return BadRequest(new { message = "Archived configurations cannot be synced." });

        var (ok, error, result, _) = await ReconcileFeatureStepsAsync(id, entity.StepsJson);
        if (!ok)
            return BadRequest(new { message = $"Could not read this workflow's steps: {error}" });
        return Ok(result);
    }

    /// <summary>
    /// Shared reconciliation core for both SyncFeatureSteps (apply) and PreviewSyncFeatureSteps
    /// (dry run) — the single diff implementation described in the WF-4 doc comment on
    /// SyncFeatureSteps. Pure computation over its inputs: reads WorkflowConfigFeature/
    /// FeatureDependency/AssetWorkflowRun from the database, but never writes anything —
    /// persistence is entirely the caller's responsibility.
    /// </summary>
    private async Task<(bool Ok, string? Error, SyncFeatureStepsResultDto? Result, List<JsonElement>? FinalSteps)> ReconcileFeatureStepsAsync(
        string workflowConfigId, string currentStepsJson)
    {
        var parsedSteps = ParseWorkflowSteps(currentStepsJson);
        if (!parsedSteps.Ok)
            return (false, parsedSteps.Error, null, null);

        var configFeatures = await _db.WorkflowConfigFeatures
            .Where(f => f.WorkflowConfigId == workflowConfigId)
            .OrderBy(f => f.SortOrder)
            .ToListAsync();

        var existingSteps = parsedSteps.Steps;

        var customSteps = new List<JsonElement>();
        var existingGeneratedByKey = new Dictionary<string, JsonElement>();
        foreach (var s in existingSteps)
        {
            var origin = s.TryGetProperty("stepOrigin", out var o) ? o.GetString() : null;
            var genKey = s.TryGetProperty("generatorKey", out var g) ? g.GetString() : null;
            if (origin == "feature-generated" && genKey is not null)
                existingGeneratedByKey[genKey] = s;
            else
                customSteps.Add(s); // never touched by this action
        }

        // Desired generator-key -> unit-step plan, built from CURRENT WorkflowConfigFeature /
        // inclusion state. A key absent here but present in existingGeneratedByKey is a removal
        // candidate; one present here but absent there is a pure addition.
        var desired = new Dictionary<string, DesiredUnitStep>();
        foreach (var cf in configFeatures)
        {
            var feature = await _db.Features.FirstOrDefaultAsync(f => f.Id == cf.FeatureId);
            if (feature is null) continue;

            // ALL dependencies of this feature (not just included) — needed so a toggled-off
            // dependency's previously-generated fields can be identified for removal.
            var allDeps = await _db.FeatureDependencies
                .Where(d => d.FeatureId == cf.FeatureId)
                .OrderBy(d => d.SortOrder)
                .ToListAsync();

            List<FeatureDependencyEntity> allInventory, allNonInventory, includedInventory, includedNonInventory;

            if (allDeps.Count > 0)
            {
                // Real Dependencies exist for this Feature — per-dependency inclusion toggles
                // (WorkflowConfigFeature.InclusionsJson) decide what generates. Unchanged
                // pre-existing behavior.
                var inclusions = ParseInclusions(cf.InclusionsJson);
                if (!inclusions.Any(kv => kv.Value)) continue;

                var includedIds = inclusions.Where(kv => kv.Value).Select(kv => kv.Key).ToHashSet();
                allInventory = allDeps.Where(d => d.IsInventory).ToList();
                allNonInventory = allDeps.Where(d => !d.IsInventory).ToList();
                includedInventory = allInventory.Where(d => includedIds.Contains(d.Id)).ToList();
                includedNonInventory = allNonInventory.Where(d => includedIds.Contains(d.Id)).ToList();
            }
            else if (feature.IsInventory && !string.IsNullOrWhiteSpace(feature.CaptureFieldsJson) && feature.CaptureFieldsJson != "[]")
            {
                // No Dependencies configured for this Feature — fall back to the Feature's OWN
                // captureFields (Settings → Features "Feature: Yes" capture definitions), the
                // same fallback the client's buildAutoSteps() already uses for Regenerate. There
                // is nothing to toggle here (no per-dependency inclusion makes sense when there
                // are no dependencies) — generation is driven purely by cf.Quantity > 0, matching
                // the simplified Builder mental model ("Builder defines HOW MANY are used").
                //
                // Modeled as a synthetic single-item dependency list so it flows through the SAME
                // diff/generation engine (ComputeFieldDiff/ApplyFieldDiff/
                // BuildInstallationStepObject) unchanged. Id = feature.Id, stable across every
                // recompute, so generated field ids (keyed off dependencyId) stay deterministic —
                // a previously-answered field never changes identity because of this fallback.
                var syntheticDep = new FeatureDependencyEntity
                {
                    Id = feature.Id,
                    FeatureId = feature.Id,
                    Name = feature.Name,
                    IsInventory = true,
                    CaptureFieldsJson = feature.CaptureFieldsJson,
                    SortOrder = 0,
                };
                allInventory = new List<FeatureDependencyEntity> { syntheticDep };
                allNonInventory = new List<FeatureDependencyEntity>();
                includedInventory = allInventory;
                includedNonInventory = new List<FeatureDependencyEntity>();
            }
            else
            {
                continue; // nothing configured to generate for this feature
            }

            var partNumber = ResolvePartNumber(feature);

            for (var unitIndex = 1; unitIndex <= cf.Quantity; unitIndex++)
            {
                if (includedInventory.Count > 0)
                {
                    var key = $"feature:{cf.FeatureId}:unit:{unitIndex}:installation";
                    desired[key] = new DesiredUnitStep(key, "installation", cf.FeatureId, feature.Name, unitIndex, includedInventory, allInventory, partNumber);
                }
                if (includedNonInventory.Count > 0)
                {
                    var key = $"feature:{cf.FeatureId}:unit:{unitIndex}:data-collection";
                    desired[key] = new DesiredUnitStep(key, "data-collection", cf.FeatureId, feature.Name, unitIndex, includedNonInventory, allNonInventory);
                }
            }
        }

        var added = new List<SyncFeatureStepItemDto>();
        var updated = new List<SyncFeatureStepItemDto>();
        var removed = new List<SyncFeatureStepItemDto>();
        var unchanged = new List<SyncFeatureStepItemDto>();
        var blocked = new List<SyncFeatureStepItemDto>();
        var finalSteps = new List<JsonElement>(customSteps);

        int maxOrder = 0;
        foreach (var s in existingSteps)
            if (s.TryGetProperty("order", out var op) && op.TryGetInt32(out var ov) && ov > maxOrder) maxOrder = ov;
        int nextOrder = maxOrder + 1;

        foreach (var (key, existingStep) in existingGeneratedByKey)
        {
            var stepId = existingStep.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";

            if (!desired.TryGetValue(key, out var plan))
            {
                // No longer desired at all (quantity decrease, a dependency group fully excluded,
                // or the whole feature removed from the config) — whole-step removal candidate.
                var blockingRuns = await FindBlockingRunsAsync(workflowConfigId, stepId);
                if (blockingRuns.Count > 0)
                {
                    finalSteps.Add(existingStep); // keep untouched
                    blocked.Add(ToResultItem(existingStep, blockingRuns));
                }
                else
                {
                    removed.Add(ToResultItem(existingStep, null)); // not re-added to finalSteps
                }
                continue;
            }

            desired.Remove(key); // consumed — anything left afterward is a pure addition

            var diff = ComputeFieldDiff(existingStep, plan);
            if (diff.ToAdd.Count == 0 && diff.ToRemoveIds.Count == 0 && diff.ToUpdateInPlace.Count == 0)
            {
                finalSteps.Add(existingStep); // byte-identical, verbatim
                unchanged.Add(ToResultItem(existingStep, null));
                continue;
            }

            var addedFieldIds = diff.ToAdd.Select(t => t.Id).Concat(diff.ToUpdateInPlace.Select(t => t.Id)).ToList();

            if (diff.ToRemoveIds.Count == 0)
            {
                // Pure addition (inclusion toggled on for a new dependency) — always safe.
                var newStep = ApplyFieldDiff(existingStep, diff, applyRemovals: true, plan);
                finalSteps.Add(newStep);
                updated.Add(ToResultItem(newStep, null, appliedFieldIds: addedFieldIds));
                continue;
            }

            var blockingRunsForStep = await FindBlockingRunsAsync(workflowConfigId, stepId);
            if (blockingRunsForStep.Count > 0)
            {
                // Partial application: apply the safe additions now, leave the unsafe removal for
                // later, and report this step as blocked (not updated) — everything else in this
                // sync still applies normally. The item explicitly carries what WAS applied
                // (appliedFieldIds), what's still stuck (blockedFieldIds), and why
                // (blockingRunsForStep) — never a bare "blocked" that could read as untouched.
                var partialStep = ApplyFieldDiff(existingStep, diff, applyRemovals: false, plan);
                finalSteps.Add(partialStep);
                blocked.Add(ToResultItem(
                    partialStep, blockingRunsForStep,
                    appliedFieldIds: addedFieldIds,
                    blockedFieldIds: diff.ToRemoveIds.ToList()));
            }
            else
            {
                var newStep = ApplyFieldDiff(existingStep, diff, applyRemovals: true, plan);
                finalSteps.Add(newStep);
                updated.Add(ToResultItem(newStep, null, appliedFieldIds: addedFieldIds));
            }
        }

        // Whatever remains in `desired` has no existing match — brand new steps. Never run-safety
        // gated: nothing could reference a step id that didn't exist before this call.
        foreach (var plan in desired.Values.OrderBy(p => p.FeatureId).ThenBy(p => p.UnitIndex).ThenBy(p => p.StepType))
        {
            var stepObj = plan.StepType == "installation"
                ? BuildInstallationStepObject(plan.FeatureId, plan.FeatureName, plan.UnitIndex, nextOrder++, plan.IncludedDeps, plan.PartNumber)
                : BuildDataCollectionStepObject(plan.FeatureId, plan.FeatureName, plan.UnitIndex, nextOrder++, plan.IncludedDeps);
            var newStep = JsonSerializer.SerializeToElement(stepObj, JsonOpts);
            finalSteps.Add(newStep);
            added.Add(ToResultItem(newStep, null));
        }

        return (true, null, new SyncFeatureStepsResultDto(added, updated, removed, unchanged, blocked), finalSteps);
    }

    // ── WF-6: reusable workflow JSON export/import (WF-1 schema) ───────────────

    /// <summary>
    /// Exports this WorkflowConfig as a WF-1-schema document: featureSelections are references +
    /// selection state only (from WorkflowConfigFeature rows — never a duplicated copy of
    /// Product/Feature/FeatureDependency master data), steps are the config's current StepsJson
    /// verbatim (custom steps exported as the authoritative content; feature-generated steps
    /// included only for inspection/round-trip traceability — ImportWorkflow never trusts them).
    /// </summary>
    [HttpGet("{id}/export")]
    public async Task<IActionResult> ExportWorkflow(string id)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();

        var configFeatures = await _db.WorkflowConfigFeatures
            .Where(f => f.WorkflowConfigId == id)
            .OrderBy(f => f.SortOrder)
            .ToListAsync();
        var featureSelections = configFeatures
            .Select(cf => new WorkflowExportFeatureSelectionDto(cf.FeatureId, cf.Quantity, ParseInclusions(cf.InclusionsJson)))
            .ToList();

        var parsedSteps = ParseWorkflowSteps(entity.StepsJson);
        if (!parsedSteps.Ok)
            return BadRequest(new { message = $"Could not read this workflow's steps: {parsedSteps.Error}" });

        return Ok(new WorkflowExportDto(SupportedWorkflowExportSchemaVersion, entity.ProductId, entity.Name, featureSelections, parsedSteps.Steps));
    }

    /// <summary>
    /// WF-8: Builder "Export Workflow Context" — workflow-scoped equivalent of
    /// GET /api/products/{id}/workflow-context. Unlike the Product-level endpoint (every linked
    /// Feature, no quantities), this returns ONLY the Features actually selected in THIS
    /// WorkflowConfig (WorkflowConfigFeature.Quantity > 0), each with its real quantity — "this is
    /// the actual equipment configuration for this workflow," so an authoring agent never has to
    /// guess which zero-quantity catalog entries to ignore. Capture fields use the same
    /// "Dependencies win when present, else Feature.captureFields" rule as generation itself, so
    /// the fields reported here are exactly what Regenerate/Sync will actually produce. Contains
    /// no customer/project/run data, no answers, no secrets.
    /// </summary>
    [HttpGet("{id}/authoring-context")]
    public async Task<IActionResult> GetAuthoringContext(string id)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();

        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == entity.ProductId);
        if (product is null) return NotFound();

        var configFeatures = await _db.WorkflowConfigFeatures
            .Where(f => f.WorkflowConfigId == id && f.Quantity > 0)
            .OrderBy(f => f.SortOrder)
            .ToListAsync();

        var featureIds = configFeatures.Select(cf => cf.FeatureId).ToList();
        var features = await _db.Features.Where(f => featureIds.Contains(f.Id)).ToListAsync();
        var featureById = features.ToDictionary(f => f.Id);

        var allDeps = await _db.FeatureDependencies
            .Where(d => featureIds.Contains(d.FeatureId))
            .OrderBy(d => d.SortOrder)
            .ToListAsync();
        var depsByFeature = allDeps.GroupBy(d => d.FeatureId).ToDictionary(g => g.Key, g => g.ToList());

        var authoringFeatures = new List<WorkflowAuthoringFeatureDto>();
        foreach (var cf in configFeatures)
        {
            if (!featureById.TryGetValue(cf.FeatureId, out var f)) continue; // stale reference, skip

            var deps = depsByFeature.TryGetValue(f.Id, out var featureDeps) ? featureDeps : new List<FeatureDependencyEntity>();

            // Same fallback rule as ReconcileFeatureStepsAsync/buildAutoSteps: real Dependencies
            // win when present, otherwise fall back to the Feature's own captureFields.
            List<string> captureFields;
            List<string> dependencyIds;
            if (deps.Count > 0)
            {
                captureFields = deps.SelectMany(d => CaptureFieldKeysFor(d)).Distinct().ToList();
                dependencyIds = deps.Select(d => d.Id).ToList();
            }
            else
            {
                captureFields = string.IsNullOrWhiteSpace(f.CaptureFieldsJson) || f.CaptureFieldsJson == "[]"
                    ? new List<string>()
                    : JsonSerializer.Deserialize<List<string>>(f.CaptureFieldsJson, JsonOpts) ?? new();
                dependencyIds = new List<string>();
            }

            authoringFeatures.Add(new WorkflowAuthoringFeatureDto(
                f.Id, f.Name, cf.Quantity, captureFields,
                f.Brand, f.Supplier, f.AlternativePartNumber, f.ManufacturerPartNumber, f.UnitPrice,
                dependencyIds));
        }

        return Ok(new WorkflowAuthoringContextDto(
            1, new ProductContextDto(product.Id, product.Name), entity.Id, entity.Name, authoringFeatures));
    }

    /// <summary>
    /// Validation-only preview for POST {id}/import — never persists anything. Reject rather than
    /// invent/remap: an unknown featureId or dependencyId, an unsupported schemaVersion, or a
    /// productId that doesn't match this config's own Product all make Valid false, and the
    /// import action itself independently re-validates and refuses to commit unless Valid.
    /// </summary>
    [HttpPost("{id}/import/validate")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> ValidateImportWorkflow(string id, [FromBody] WorkflowImportRequestDto request)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();

        var validation = await ValidateImportAsync(entity, request);
        return Ok(validation);
    }

    /// <summary>
    /// Commits a WF-1-schema import, atomically. Fully validates BEFORE any mutation, then wraps
    /// the entire operation — WorkflowConfigFeature replacement, the legacy FeatureSelectionsJson
    /// mirror, custom-step import, and generated-step reconciliation — in a single DB transaction
    /// (see FieldDefinitionsController for the same BeginTransactionAsync/commit/rollback pattern
    /// already used elsewhere in this codebase). Any exception rolls back to the exact pre-import
    /// state; nothing is left partially applied.
    ///
    /// Import is deliberately all-or-nothing on run-safety, unlike an ordinary Sync Feature Steps
    /// call (WF-4's partial-application behavior is untouched and still applies there): if
    /// reconciling the imported feature selections against Product master data would require
    /// removing or identity-changing a generated step that an unlocked AssetWorkflowRun still
    /// references, the WHOLE import is rejected (409) with which step(s)/run(s) blocked it, and
    /// the transaction is rolled back — never a partial commit.
    ///
    /// Generated steps are always reconciled via the SAME shared ReconcileFeatureStepsAsync used
    /// by Publish/SyncFeatureSteps — the imported file's own generated-step content is discarded
    /// entirely and never trusted as Product master truth, while any compatible custom
    /// augmentation already on this config's EXISTING generated steps is preserved exactly as an
    /// ordinary sync would.
    /// </summary>
    [HttpPost("{id}/import")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> ImportWorkflow(string id, [FromBody] WorkflowImportRequestDto request)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();
        if (entity.Status == "Archived")
            return BadRequest(new { message = "Archived configurations cannot be imported into." });

        // Full validation BEFORE any mutation — nothing below this point runs unless the import
        // is structurally valid on its own terms (schema/product/feature/dependency references,
        // no duplicate feature selections).
        var validation = await ValidateImportAsync(entity, request);
        if (!validation.Valid)
            return BadRequest(new { message = "Import validation failed.", validation });

        var featureSelections = request.FeatureSelections ?? new();

        using var transaction = await _db.Database.BeginTransactionAsync();
        try
        {
            // Replace this config's canonical WorkflowConfigFeature rows.
            var existingCf = await _db.WorkflowConfigFeatures.Where(f => f.WorkflowConfigId == id).ToListAsync();
            _db.WorkflowConfigFeatures.RemoveRange(existingCf);
            var sortOrder = 0;
            foreach (var fs in featureSelections)
            {
                _db.WorkflowConfigFeatures.Add(new WorkflowConfigFeatureEntity
                {
                    Id = Guid.NewGuid().ToString(),
                    WorkflowConfigId = id,
                    FeatureId = fs.FeatureId,
                    Quantity = fs.Quantity,
                    InclusionsJson = JsonSerializer.Serialize(fs.Inclusions ?? new Dictionary<string, bool>(), JsonOpts),
                    SortOrder = sortOrder++,
                });
            }
            // Flushed within the transaction so ReconcileFeatureStepsAsync below reads the
            // just-imported rows, not the old ones — a later failure or rejection still rolls
            // this back too, since nothing commits until the very end.
            await _db.SaveChangesAsync();

            // Legacy compatibility mirror only — generation/sync/import logic never reads this back.
            entity.FeatureSelectionsJson = JsonSerializer.Serialize(
                featureSelections.Select(fs => new { featureId = fs.FeatureId, included = fs.Quantity > 0, activeCount = fs.Quantity }),
                JsonOpts);

            // Custom steps import verbatim and become this config's authoritative custom-step set.
            // Any EXISTING generated steps on this config are carried forward only as a
            // reconciliation base (so compatible custom augmentation on them survives via
            // ReconcileFeatureStepsAsync's field-preserving diff) — never as authoritative content
            // on their own, and never from the imported file's own generated-step JSON.
            var importedCustomSteps = (request.Steps ?? new())
                .Where(s => !(s.TryGetProperty("stepOrigin", out var o) && o.GetString() == "feature-generated"))
                .ToList();
            var parsedExistingSteps = ParseWorkflowSteps(entity.StepsJson);
            if (!parsedExistingSteps.Ok)
            {
                await transaction.RollbackAsync();
                _db.ChangeTracker.Clear();
                return BadRequest(new { message = $"Could not read this workflow's existing steps: {parsedExistingSteps.Error}" });
            }
            var existingGeneratedSteps = parsedExistingSteps.Steps
                .Where(s => s.TryGetProperty("stepOrigin", out var o) && o.GetString() == "feature-generated")
                .ToList();
            var stagedStepsJson = JsonSerializer.Serialize(importedCustomSteps.Concat(existingGeneratedSteps), JsonOpts);

            var (reconcileOk, reconcileError, reconcileResult, finalSteps) = await ReconcileFeatureStepsAsync(id, stagedStepsJson);
            if (!reconcileOk)
            {
                // stagedStepsJson is always a freshly-serialized bare array (built above), so this
                // can only fail on a genuinely malformed request.Steps payload, not on the shape
                // ambiguity itself — still handled the same controlled way.
                await transaction.RollbackAsync();
                _db.ChangeTracker.Clear();
                return BadRequest(new { message = $"Could not reconcile generated steps: {reconcileError}" });
            }

            if (reconcileResult!.Blocked.Count > 0)
            {
                // All-or-nothing: reject the whole import and commit nothing, rather than WF-4's
                // ordinary partial-application behavior (which stays unchanged for SyncFeatureSteps
                // itself). Feature selections, custom steps, and generated steps must all remain
                // exactly as they were before this call.
                await transaction.RollbackAsync();
                _db.ChangeTracker.Clear();
                return Conflict(new WorkflowImportBlockedDto(
                    "Import cannot proceed: applying it would require changing a generated step that an active run still references.",
                    reconcileResult.Blocked));
            }

            entity.StepsJson = JsonSerializer.Serialize(finalSteps, JsonOpts);
            if (!string.IsNullOrWhiteSpace(request.Name)) entity.Name = request.Name;
            entity.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }

        return Ok(ToDto(entity));
    }

    private async Task<WorkflowImportValidationDto> ValidateImportAsync(WorkflowConfigEntity targetConfig, WorkflowImportRequestDto request)
    {
        var schemaVersionSupported = request.SchemaVersion == SupportedWorkflowExportSchemaVersion;
        var productMatches = request.ProductId == targetConfig.ProductId;
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == request.ProductId);

        var featureSelections = request.FeatureSelections ?? new();

        // Reject rather than silently merge or let last-one-win decide the configuration.
        var duplicateFeatureIds = featureSelections
            .GroupBy(fs => fs.FeatureId)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToList();

        var featureIds = featureSelections.Select(fs => fs.FeatureId).Distinct().ToList();
        var linkedFeatureIds = featureIds.Count == 0
            ? new List<string>()
            : await _db.ProductFeatures
                .Where(pf => pf.ProductId == request.ProductId && featureIds.Contains(pf.FeatureId))
                .Select(pf => pf.FeatureId)
                .ToListAsync();
        var unknownFeatureIds = featureIds.Except(linkedFeatureIds).ToList();

        var allDeps = featureIds.Count == 0
            ? new List<FeatureDependencyEntity>()
            : await _db.FeatureDependencies.Where(d => featureIds.Contains(d.FeatureId)).ToListAsync();
        var depIdsByFeature = allDeps.GroupBy(d => d.FeatureId).ToDictionary(g => g.Key, g => g.Select(d => d.Id).ToHashSet());

        var unknownDependencyIds = new List<string>();
        var dependencyReferencesTotal = 0;
        foreach (var fs in featureSelections)
        {
            foreach (var depId in (fs.Inclusions ?? new()).Keys)
            {
                dependencyReferencesTotal++;
                var known = depIdsByFeature.TryGetValue(fs.FeatureId, out var set) && set.Contains(depId);
                if (!known) unknownDependencyIds.Add(depId);
            }
        }

        var steps = request.Steps ?? new();
        var customStepCount = steps.Count(s => !(s.TryGetProperty("stepOrigin", out var o) && o.GetString() == "feature-generated"));

        // Same unit x stepType grouping rule as WF-3's generator — one installation group and one
        // data-collection group per unit, never split per dependency.
        var generatedStepsToReconstruct = 0;
        foreach (var fs in featureSelections)
        {
            if (!depIdsByFeature.TryGetValue(fs.FeatureId, out _)) continue;
            var deps = allDeps.Where(d => d.FeatureId == fs.FeatureId).ToList();
            var includedIds = (fs.Inclusions ?? new()).Where(kv => kv.Value).Select(kv => kv.Key).ToHashSet();
            var hasInventory = deps.Any(d => d.IsInventory && includedIds.Contains(d.Id));
            var hasNonInventory = deps.Any(d => !d.IsInventory && includedIds.Contains(d.Id));
            var groupsPerUnit = (hasInventory ? 1 : 0) + (hasNonInventory ? 1 : 0);
            generatedStepsToReconstruct += groupsPerUnit * Math.Max(0, fs.Quantity);
        }

        var valid = schemaVersionSupported && productMatches && product is not null
            && unknownFeatureIds.Count == 0 && unknownDependencyIds.Count == 0
            && duplicateFeatureIds.Count == 0;

        return new WorkflowImportValidationDto(
            valid,
            request.ProductId,
            product?.Name ?? "",
            featureIds.Count - unknownFeatureIds.Count,
            featureIds.Count,
            dependencyReferencesTotal - unknownDependencyIds.Count,
            dependencyReferencesTotal,
            customStepCount,
            generatedStepsToReconstruct,
            unknownFeatureIds,
            unknownDependencyIds,
            schemaVersionSupported,
            productMatches,
            duplicateFeatureIds);
    }

    // POST api/workflow-configs/{id}/clone  — creates a new Draft version
    [HttpPost("{id}/clone")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Clone(string id)
    {
        var source = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (source is null) return NotFound();

        var createdBy = User.Identity?.Name ?? User.FindFirst("email")?.Value;
        var clone = new WorkflowConfigEntity
        {
            Id                    = Guid.NewGuid().ToString(),
            ProductId             = source.ProductId,
            Name                  = source.Name,
            DisplayName           = source.DisplayName,
            ConfigType            = source.ConfigType,
            WorkflowTypeId        = source.WorkflowTypeId,
            Status                = "Draft",
            Version               = source.Version + 1,
            TemplateSourceId      = source.Id,
            StepsJson             = source.StepsJson,
            MediaJson             = source.MediaJson,
            FeatureSelectionsJson = source.FeatureSelectionsJson,
            Notes                 = source.Notes,
            CreatedBy             = createdBy,
            CreatedAt             = DateTime.UtcNow,
            UpdatedAt             = DateTime.UtcNow,
        };
        _db.WorkflowConfigs.Add(clone);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = clone.Id }, ToDto(clone));
    }

    // POST api/workflow-configs/{id}/archive
    [HttpPost("{id}/archive")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Archive(string id)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();
        entity.Status    = "Archived";
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    // DELETE api/workflow-configs/{id}  — only if no runs reference it
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();

        var hasRuns = await _db.AssetWorkflowRuns.AnyAsync(r => r.WorkflowConfigId == id);
        if (hasRuns)
            return BadRequest(new { message = "Cannot delete a configuration that has workflow runs. Archive it instead." });

        _db.WorkflowConfigs.Remove(entity);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // POST api/workflow-configs/{id}/media  — upload media file
    // Explicit request ceiling backs up (does not replace) the IFormFile.Length check
    // inside WorkflowMediaValidator, which enforces the precise, type-aware policy.
    [HttpPost("{id}/media")]
    [Authorize(Roles = "Admin,Project Manager")]
    [RequestSizeLimit(WorkflowMediaValidator.MaxRequestBytes)]
    public async Task<IActionResult> UploadMedia(string id, IFormFile file)
    {
        if (!IsPathSafeConfigId(id)) return NotFound();

        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();

        var validation = await WorkflowMediaValidator.ValidateAsync(file, HttpContext.RequestAborted);
        if (!validation.IsValid)
            return BadRequest(new { message = validation.Error });

        var mediaId  = Guid.NewGuid().ToString();
        var fileName = $"{mediaId}{validation.Extension}";
        var relativePath = _files.BuildRelativePath("Storage", "WorkflowMedia", id, fileName);

        await _files.SaveAsync(relativePath, file!.OpenReadStream());

        var mediaUrl = $"/api/workflow-configs/{id}/media/{mediaId}/file";

        // Append to MediaJson array
        var mediaList = System.Text.Json.JsonSerializer.Deserialize<List<System.Text.Json.JsonElement>>(
            entity.MediaJson, new System.Text.Json.JsonSerializerOptions()) ?? new();
        var newItem = System.Text.Json.JsonSerializer.SerializeToElement(new
        {
            id = mediaId, type = validation.Kind == WorkflowMediaKind.Image ? "image" : "video",
            name = file.FileName, size = file.Length,
            mime = validation.Mime, url = mediaUrl,
            createdAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
        mediaList.Add(newItem);
        entity.MediaJson = System.Text.Json.JsonSerializer.Serialize(mediaList);
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    // GET api/workflow-configs/{id}/media/{mediaId}/file
    // AllowAnonymous is unchanged in this phase (Phase 1 is upload/serve validation only).
    // Auth tightening is a later phase, deferred until Runner rendering no longer depends
    // on a bare <img src>/<video src> pointed directly at this URL.
    //
    // Serves real HTTP byte ranges via IFileStorageService.OpenReadRangeAsync rather than
    // ASP.NET's File(..., enableRangeProcessing: true). That flag requires Stream.CanSeek to
    // do anything — true for LocalFileStorageService's FileStream, but S3's GetObject
    // ResponseStream is not seekable, so enableRangeProcessing silently no-ops on S3-backed
    // storage: no 206, no Accept-Ranges, no Content-Range, ever (proven live against staging).
    // OpenReadRangeAsync fixes this uniformly: S3 uses a real ranged GetObjectRequest.ByteRange
    // (S3 truncates its own response stream to the requested bytes — never buffers the full
    // object), while local disk seeks + bounds the FileStream itself. WKWebView's <video>
    // playback pipeline requires genuine 206/Accept-Ranges/Content-Range to trust a source as
    // seekable/streamable — without it, playback is refused ("unavailable" state).
    [HttpGet("{id}/media/{mediaId}/file")]
    [AllowAnonymous]
    public async Task<IActionResult> ServeMedia(string id, string mediaId, CancellationToken cancellationToken)
    {
        if (!IsPathSafeConfigId(id) || !IsValidMediaId(mediaId)) return NotFound();

        var mediaDir = WorkflowMediaDirectory(id);
        var files    = _files.ListFileNames(mediaDir, mediaId);
        if (files.Count == 0) return NotFound();
        var storedName = files[0];
        var relativePath = _files.BuildRelativePath(mediaDir, storedName);
        var ext = Path.GetExtension(storedName);
        // Unknown/unsupported stored extensions are never served — no "default to video/mp4".
        if (!WorkflowMediaValidator.TryGetMimeForExtension(ext, out var mime)) return NotFound();

        var rangeHeaderValue = Request.Headers.TryGetValue("Range", out var rangeValues) ? rangeValues.ToString() : null;

        FileRangeResult? result;
        try
        {
            result = await _files.OpenReadRangeAsync(relativePath, rangeHeaderValue, cancellationToken);
        }
        catch (RangeNotSatisfiableException ex)
        {
            Response.Headers["Content-Range"] = $"bytes */{ex.TotalLength}";
            return StatusCode(StatusCodes.Status416RangeNotSatisfiable);
        }

        if (result is null) return NotFound();

        await using var stream = result.Stream;
        Response.ContentType = mime;
        Response.Headers["Accept-Ranges"] = "bytes";
        Response.ContentLength = result.ContentLength;
        if (result.IsPartial)
        {
            Response.StatusCode = StatusCodes.Status206PartialContent;
            Response.Headers["Content-Range"] = $"bytes {result.RangeStart}-{result.RangeEnd}/{result.TotalLength}";
        }
        else
        {
            Response.StatusCode = StatusCodes.Status200OK;
        }

        await stream.CopyToAsync(Response.Body, cancellationToken);
        return new EmptyResult();
    }

    // DELETE api/workflow-configs/{id}/media/{mediaId}
    [HttpDelete("{id}/media/{mediaId}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> DeleteMedia(string id, string mediaId)
    {
        if (!IsPathSafeConfigId(id) || !IsValidMediaId(mediaId)) return NotFound();

        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();

        var mediaDir = WorkflowMediaDirectory(id);
        foreach (var storedName in _files.ListFileNames(mediaDir, mediaId))
        {
            _files.Delete(_files.BuildRelativePath(mediaDir, storedName));
        }

        var mediaList = System.Text.Json.JsonSerializer.Deserialize<List<System.Text.Json.JsonElement>>(
            entity.MediaJson, new System.Text.Json.JsonSerializerOptions()) ?? new();
        mediaList.RemoveAll(m =>
            m.TryGetProperty("id", out var prop) && prop.GetString() == mediaId);
        entity.MediaJson = System.Text.Json.JsonSerializer.Serialize(mediaList);
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }
}
