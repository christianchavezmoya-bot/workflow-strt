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
        string featureId, string featureName, int unitIndex, int order, List<FeatureDependencyEntity> inventoryDeps)
    {
        var generatorKey = $"feature:{featureId}:unit:{unitIndex}:installation";
        var cfList = new List<object>();
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
            // Load the current steps array
            var steps = JsonSerializer.Deserialize<List<JsonElement>>(entity.StepsJson, JsonOpts) ?? new();

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
                var inclusions = ParseInclusions(cf.InclusionsJson);

                if (!inclusions.Any(kv => kv.Value)) continue; // nothing included

                // Load the feature and its included dependencies
                var feature = await _db.Features.FirstOrDefaultAsync(f => f.Id == cf.FeatureId);
                if (feature is null) continue;

                var depIds = inclusions.Where(kv => kv.Value).Select(kv => kv.Key).ToList();
                var deps = await _db.FeatureDependencies
                    .Where(d => d.FeatureId == cf.FeatureId && depIds.Contains(d.Id))
                    .OrderBy(d => d.SortOrder)
                    .ToListAsync();

                var inventoryDeps = deps.Where(d => d.IsInventory).ToList();
                var nonInventoryDeps = deps.Where(d => !d.IsInventory).ToList();

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
                        var stepObj = BuildInstallationStepObject(cf.FeatureId, feature.Name, unitIndex, nextOrder++, inventoryDeps);
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
        List<FeatureDependencyEntity> IncludedDeps, List<FeatureDependencyEntity> AllDepsOfType);

    private sealed record FieldDiff(string ArrayProp, List<(string Id, object Field)> ToAdd, HashSet<string> ToRemoveIds);

    /// <summary>Shape of the outer run snapshot object built in AssetWorkflowRunsController's
    /// start-run action — its StepsJson property is itself a still-serialized JSON string (the
    /// frozen WorkflowConfig.StepsJson at run-start), not a nested array, so reading it is a
    /// two-stage parse.</summary>
    private sealed record RunSnapshotRef(string? StepsJson);

    private sealed record SnapshotStepIdRef(string Id);

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
        foreach (var dep in plan.IncludedDeps)
            foreach (var fieldKey in FieldKeysFor(dep, plan.StepType))
            {
                var fid = GeneratedFieldId(plan.FeatureId, plan.UnitIndex, dep.Id, fieldKey);
                if (!existingIds.Contains(fid))
                    toAdd.Add((fid, BuildFieldObjectFor(plan.FeatureId, plan.UnitIndex, dep, fieldKey, plan.StepType)));
            }

        // Removal universe: only ids derivable from a dependency of this feature/type that is no
        // longer included. Anything else present in the array (a manual field, or a field this
        // formula could never have produced) is never a removal candidate.
        var removableIds = new HashSet<string>();
        foreach (var dep in plan.AllDepsOfType)
        {
            if (plan.IncludedDeps.Any(d => d.Id == dep.Id)) continue;
            foreach (var fieldKey in FieldKeysFor(dep, plan.StepType))
                removableIds.Add(GeneratedFieldId(plan.FeatureId, plan.UnitIndex, dep.Id, fieldKey));
        }
        var toRemoveIds = existingIds.Intersect(removableIds).ToHashSet();

        return new FieldDiff(arrayProp, toAdd, toRemoveIds);
    }

    /// <summary>Applies a FieldDiff to an existing step, preserving every other property verbatim
    /// (title, description, mediaIds, decisions, overrideInReport/overrideReportText — any custom
    /// augmentation an admin attached after generation). Additions always apply; removals apply
    /// only when applyRemovals is true (the caller has already confirmed it's run-safe).</summary>
    private static JsonElement ApplyFieldDiff(JsonElement existingStep, FieldDiff diff, bool applyRemovals, DesiredUnitStep plan)
    {
        var existingArray = existingStep.TryGetProperty(diff.ArrayProp, out var arr)
            ? arr.EnumerateArray().ToList() : new List<JsonElement>();

        var kept = existingArray
            .Where(e => !(applyRemovals && diff.ToRemoveIds.Contains(e.GetProperty("id").GetString() ?? "")))
            .Select(e => (object)e)
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
            var steps = JsonSerializer.Deserialize<List<SnapshotStepIdRef>>(outer.StepsJson, JsonOpts);
            return steps?.Any(s => s.Id == stepId) == true;
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
        var (result, finalSteps) = await ReconcileFeatureStepsAsync(id, entity.StepsJson);

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

        var (result, _) = await ReconcileFeatureStepsAsync(id, entity.StepsJson);
        return Ok(result);
    }

    /// <summary>
    /// Shared reconciliation core for both SyncFeatureSteps (apply) and PreviewSyncFeatureSteps
    /// (dry run) — the single diff implementation described in the WF-4 doc comment on
    /// SyncFeatureSteps. Pure computation over its inputs: reads WorkflowConfigFeature/
    /// FeatureDependency/AssetWorkflowRun from the database, but never writes anything —
    /// persistence is entirely the caller's responsibility.
    /// </summary>
    private async Task<(SyncFeatureStepsResultDto Result, List<JsonElement> FinalSteps)> ReconcileFeatureStepsAsync(
        string workflowConfigId, string currentStepsJson)
    {
        var configFeatures = await _db.WorkflowConfigFeatures
            .Where(f => f.WorkflowConfigId == workflowConfigId)
            .OrderBy(f => f.SortOrder)
            .ToListAsync();

        var existingSteps = JsonSerializer.Deserialize<List<JsonElement>>(currentStepsJson, JsonOpts) ?? new();

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
            var inclusions = ParseInclusions(cf.InclusionsJson);
            if (!inclusions.Any(kv => kv.Value)) continue;

            var feature = await _db.Features.FirstOrDefaultAsync(f => f.Id == cf.FeatureId);
            if (feature is null) continue;

            // ALL dependencies of this feature (not just included) — needed so a toggled-off
            // dependency's previously-generated fields can be identified for removal.
            var allDeps = await _db.FeatureDependencies
                .Where(d => d.FeatureId == cf.FeatureId)
                .OrderBy(d => d.SortOrder)
                .ToListAsync();

            var includedIds = inclusions.Where(kv => kv.Value).Select(kv => kv.Key).ToHashSet();
            var allInventory = allDeps.Where(d => d.IsInventory).ToList();
            var allNonInventory = allDeps.Where(d => !d.IsInventory).ToList();
            var includedInventory = allInventory.Where(d => includedIds.Contains(d.Id)).ToList();
            var includedNonInventory = allNonInventory.Where(d => includedIds.Contains(d.Id)).ToList();

            for (var unitIndex = 1; unitIndex <= cf.Quantity; unitIndex++)
            {
                if (includedInventory.Count > 0)
                {
                    var key = $"feature:{cf.FeatureId}:unit:{unitIndex}:installation";
                    desired[key] = new DesiredUnitStep(key, "installation", cf.FeatureId, feature.Name, unitIndex, includedInventory, allInventory);
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
            if (diff.ToAdd.Count == 0 && diff.ToRemoveIds.Count == 0)
            {
                finalSteps.Add(existingStep); // byte-identical, verbatim
                unchanged.Add(ToResultItem(existingStep, null));
                continue;
            }

            var addedFieldIds = diff.ToAdd.Select(t => t.Id).ToList();

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
                ? BuildInstallationStepObject(plan.FeatureId, plan.FeatureName, plan.UnitIndex, nextOrder++, plan.IncludedDeps)
                : BuildDataCollectionStepObject(plan.FeatureId, plan.FeatureName, plan.UnitIndex, nextOrder++, plan.IncludedDeps);
            var newStep = JsonSerializer.SerializeToElement(stepObj, JsonOpts);
            finalSteps.Add(newStep);
            added.Add(ToResultItem(newStep, null));
        }

        return (new SyncFeatureStepsResultDto(added, updated, removed, unchanged, blocked), finalSteps);
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
