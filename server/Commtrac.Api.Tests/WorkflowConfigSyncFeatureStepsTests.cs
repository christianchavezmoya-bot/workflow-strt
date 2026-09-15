using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

// WF-4: POST /workflow-configs/{id}/sync-feature-steps — non-destructive reconciliation of
// stepOrigin: "feature-generated" steps against current WorkflowConfigFeature/FeatureDependency
// state. Tests seed configs directly (bypassing /publish) so each scenario exercises the sync
// endpoint's own diff/apply logic in isolation.
[Collection(ApiTestCollection.Name)]
public class WorkflowConfigSyncFeatureStepsTests : IClassFixture<ApiTestFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);
    private readonly ApiTestFactory _factory;

    public WorkflowConfigSyncFeatureStepsTests(ApiTestFactory factory) => _factory = factory;

    [Fact]
    public async Task Unchanged_sync_is_a_no_op()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, _, _) = await SeedFeatureConfigAsync(
            quantity: 2, deps: new[] { new DepSpec("Camera Unit", true, new[] { "serialNo" }) });

        var first = await SyncAsync(client, configId);
        Assert.Equal(2, first.Added.Count);

        var stepsAfterFirst = await GetStepsJsonAsync(configId);

        var second = await SyncAsync(client, configId);
        Assert.Empty(second.Added);
        Assert.Empty(second.Updated);
        Assert.Empty(second.Removed);
        Assert.Empty(second.Blocked);
        Assert.Equal(2, second.Unchanged.Count);

        var stepsAfterSecond = await GetStepsJsonAsync(configId);
        Assert.Equal(
            stepsAfterFirst.Select(s => s.GetProperty("id").GetString()).OrderBy(x => x),
            stepsAfterSecond.Select(s => s.GetProperty("id").GetString()).OrderBy(x => x));
    }

    [Fact]
    public async Task Quantity_2_to_4_adds_only_units_3_and_4()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, featureId, _) = await SeedFeatureConfigAsync(
            quantity: 2, deps: new[] { new DepSpec("Camera Unit", true, new[] { "serialNo" }) });

        var first = await SyncAsync(client, configId);
        var unit1Id = first.Added.Single(i => i.UnitIndex == 1).StepId;
        var unit2Id = first.Added.Single(i => i.UnitIndex == 2).StepId;

        await UpdateQuantityAsync(configId, featureId, 4);
        var second = await SyncAsync(client, configId);

        Assert.Equal(2, second.Added.Count);
        Assert.Equal(new[] { 3, 4 }, second.Added.Select(i => i.UnitIndex).OrderBy(i => i));
        Assert.Empty(second.Updated);
        Assert.Empty(second.Removed);
        Assert.Empty(second.Blocked);
        Assert.Equal(2, second.Unchanged.Count);

        // Existing unit 1/2 ids must not change.
        Assert.Equal(unit1Id, second.Unchanged.Single(i => i.UnitIndex == 1).StepId);
        Assert.Equal(unit2Id, second.Unchanged.Single(i => i.UnitIndex == 2).StepId);
    }

    [Fact]
    public async Task Quantity_4_to_2_removes_only_units_4_and_3()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, featureId, _) = await SeedFeatureConfigAsync(
            quantity: 4, deps: new[] { new DepSpec("Camera Unit", true, new[] { "serialNo" }) });

        var first = await SyncAsync(client, configId);
        Assert.Equal(4, first.Added.Count);
        var unit1Id = first.Added.Single(i => i.UnitIndex == 1).StepId;
        var unit2Id = first.Added.Single(i => i.UnitIndex == 2).StepId;

        await UpdateQuantityAsync(configId, featureId, 2);
        var second = await SyncAsync(client, configId);

        Assert.Equal(2, second.Removed.Count);
        Assert.Equal(new[] { 3, 4 }, second.Removed.Select(i => i.UnitIndex).OrderBy(i => i));
        Assert.Empty(second.Blocked);
        Assert.Equal(2, second.Unchanged.Count);
        Assert.Equal(unit1Id, second.Unchanged.Single(i => i.UnitIndex == 1).StepId);
        Assert.Equal(unit2Id, second.Unchanged.Single(i => i.UnitIndex == 2).StepId);

        var stepsAfter = await GetStepsJsonAsync(configId);
        Assert.Equal(2, stepsAfter.Count);
    }

    [Fact]
    public async Task Inclusion_toggle_adds_and_removes_only_relevant_dependency_content_and_reenabling_recreates_same_ids()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, featureId, depIdByName) = await SeedFeatureConfigAsync(
            quantity: 1,
            deps: new[]
            {
                new DepSpec("Camera Body", true, new[] { "serialNo" }),
                new DepSpec("PoE Injector", true, new[] { "serialNo" }),
            });
        var bodyDepId = depIdByName["Camera Body"];
        var injectorDepId = depIdByName["PoE Injector"];

        var first = await SyncAsync(client, configId);
        var stepId = first.Added.Single().StepId;
        var stepsAfterFirst = await GetStepsJsonAsync(configId);
        var fieldIdsAfterFirst = CaptureFieldIds(stepsAfterFirst.Single(s => s.GetProperty("id").GetString() == stepId));
        Assert.Equal(2, fieldIdsAfterFirst.Count);
        var injectorFieldId = ComputeExpectedFieldId(featureId, 1, injectorDepId, "serialNo");
        Assert.Contains(injectorFieldId, fieldIdsAfterFirst);

        // Toggle OFF the injector dependency — same generatorKey (step survives, only its field
        // content changes), and the camera body dependency is untouched.
        await UpdateInclusionsAsync(configId, featureId, new Dictionary<string, bool> { [bodyDepId] = true, [injectorDepId] = false });
        var second = await SyncAsync(client, configId);

        Assert.Empty(second.Added);
        Assert.Empty(second.Removed);
        Assert.Empty(second.Blocked);
        var updatedItem = Assert.Single(second.Updated);
        Assert.Equal(stepId, updatedItem.StepId); // same step identity — not recreated

        var stepsAfterToggleOff = await GetStepsJsonAsync(configId);
        var fieldIdsAfterToggleOff = CaptureFieldIds(stepsAfterToggleOff.Single(s => s.GetProperty("id").GetString() == stepId));
        Assert.Single(fieldIdsAfterToggleOff);
        Assert.DoesNotContain(injectorFieldId, fieldIdsAfterToggleOff);

        // Re-enable the injector dependency — same deterministic field id must reappear.
        await UpdateInclusionsAsync(configId, featureId, new Dictionary<string, bool> { [bodyDepId] = true, [injectorDepId] = true });
        var third = await SyncAsync(client, configId);

        Assert.Empty(third.Added);
        Assert.Empty(third.Removed);
        var reUpdatedItem = Assert.Single(third.Updated);
        Assert.Equal(stepId, reUpdatedItem.StepId);

        var stepsAfterToggleOn = await GetStepsJsonAsync(configId);
        var fieldIdsAfterToggleOn = CaptureFieldIds(stepsAfterToggleOn.Single(s => s.GetProperty("id").GetString() == stepId));
        Assert.Equal(2, fieldIdsAfterToggleOn.Count);
        Assert.Contains(injectorFieldId, fieldIdsAfterToggleOn); // same deterministic id recreated
    }

    [Fact]
    public async Task Custom_steps_are_never_touched()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, _, _) = await SeedFeatureConfigAsync(
            quantity: 1, deps: new[] { new DepSpec("Camera Unit", true, new[] { "serialNo" }) });

        var customStep = new
        {
            id = "custom-prep-step",
            order = 0,
            title = "Preparation & Permits",
            description = "Manually authored — not feature-generated.",
            overrideInReport = false,
            overrideReportText = "",
            includeDescriptionInReport = true,
            mediaIds = Array.Empty<string>(),
            decisionsEnabled = false,
            decisions = Array.Empty<object>(),
            inputs = Array.Empty<object>(),
            nextStepId = (string?)null,
            captureFields = Array.Empty<object>(),
            stepType = "preparation",
        };
        await SetStepsJsonAsync(configId, JsonSerializer.Serialize(new[] { customStep }, JsonOpts));

        var result = await SyncAsync(client, configId);
        Assert.Single(result.Added); // the one feature-generated unit
        Assert.DoesNotContain(result.Added, i => i.StepId == "custom-prep-step");
        Assert.DoesNotContain(result.Updated, i => i.StepId == "custom-prep-step");
        Assert.DoesNotContain(result.Removed, i => i.StepId == "custom-prep-step");

        var stepsAfter = await GetStepsJsonAsync(configId);
        var custom = stepsAfter.Single(s => s.GetProperty("id").GetString() == "custom-prep-step");
        Assert.Equal("Preparation & Permits", custom.GetProperty("title").GetString());
        Assert.Equal("Manually authored — not feature-generated.", custom.GetProperty("description").GetString());
    }

    [Fact]
    public async Task Blocked_run_prevents_unsafe_removal_while_unrelated_safe_items_still_apply()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, featureAId, _) = await SeedFeatureConfigAsync(
            quantity: 2, deps: new[] { new DepSpec("Camera Unit", true, new[] { "serialNo" }) });

        // A second, independent feature on the same config — its quantity increase must apply
        // (safe, unrelated) even though feature A's removal below gets blocked.
        var featureBId = await AddSecondFeatureAsync(configId, quantity: 1,
            deps: new[] { new DepSpec("Sensor Unit", true, new[] { "serialNo" }) });

        var first = await SyncAsync(client, configId);
        Assert.Equal(3, first.Added.Count); // A unit1, A unit2, B unit1
        var featureAUnit2StepId = first.Added.Single(i => i.FeatureId == featureAId && i.UnitIndex == 2).StepId;

        var runId = await SeedBlockingRunAsync(configId, featureAUnit2StepId);

        await UpdateQuantityAsync(configId, featureAId, 1); // wants to remove A unit 2 — blocked
        await UpdateQuantityAsync(configId, featureBId, 2); // wants to add B unit 2 — safe

        var second = await SyncAsync(client, configId);

        var blockedItem = Assert.Single(second.Blocked);
        Assert.Equal(featureAUnit2StepId, blockedItem.StepId);
        Assert.NotNull(blockedItem.BlockingRuns);
        Assert.Contains(blockedItem.BlockingRuns!, r => r.RunId == runId);
        // Whole-step block (the step wasn't a survivor being reconciled — it just couldn't be
        // removed at all), so there's no partial field-level change to report.
        Assert.Null(blockedItem.AppliedFieldIds);
        Assert.Null(blockedItem.BlockedFieldIds);

        // Unrelated safe addition still applied in the same sync call.
        Assert.Contains(second.Added, i => i.FeatureId == featureBId && i.UnitIndex == 2);

        // The blocked step must still be present in StepsJson, untouched.
        var stepsAfter = await GetStepsJsonAsync(configId);
        Assert.Contains(stepsAfter, s => s.GetProperty("id").GetString() == featureAUnit2StepId);
    }

    // Dedicated regression test for the approved run-safety policy: blocking must not require an
    // existing StepResultsJson value — the run's immutable WorkflowSnapshotJson referencing the
    // step is sufficient on its own.
    [Fact]
    public async Task Unlocked_run_with_no_recorded_result_still_blocks_removal_via_snapshot_reference()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, featureId, _) = await SeedFeatureConfigAsync(
            quantity: 1, deps: new[] { new DepSpec("Camera Unit", true, new[] { "serialNo" }) });

        var first = await SyncAsync(client, configId);
        var stepId = first.Added.Single().StepId;

        // hasResult defaults to false — this run's StepResultsJson is "[]", proving the guard
        // fires purely from the snapshot reference, with zero captured data for the step.
        var runId = await SeedBlockingRunAsync(configId, stepId);

        await UpdateQuantityAsync(configId, featureId, 0); // wants to remove the only unit
        var second = await SyncAsync(client, configId);

        Assert.Empty(second.Removed);
        var blockedItem = Assert.Single(second.Blocked);
        Assert.Equal(stepId, blockedItem.StepId);
        Assert.Contains(blockedItem.BlockingRuns!, r => r.RunId == runId);

        var stepsAfter = await GetStepsJsonAsync(configId);
        Assert.Contains(stepsAfter, s => s.GetProperty("id").GetString() == stepId);
    }

    // Dedicated regression test for the partial-application result contract: a step that gets a
    // safe addition AND a blocked removal in the same sync must explicitly report both, plus the
    // blocking run — never a bare "blocked" that could read as if nothing changed.
    [Fact]
    public async Task Partial_application_reports_applied_and_blocked_field_ids_together()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, featureId, depIdByName) = await SeedFeatureConfigAsync(
            quantity: 1,
            deps: new[]
            {
                new DepSpec("Camera Body", true, new[] { "serialNo" }),
                new DepSpec("PoE Injector", true, new[] { "serialNo" }),
            });
        var bodyDepId = depIdByName["Camera Body"];
        var injectorDepId = depIdByName["PoE Injector"];

        // Establish with only the body included.
        await UpdateInclusionsAsync(configId, featureId, new Dictionary<string, bool> { [bodyDepId] = true, [injectorDepId] = false });
        var first = await SyncAsync(client, configId);
        var stepId = first.Added.Single().StepId;
        var bodyFieldId = ComputeExpectedFieldId(featureId, 1, bodyDepId, "serialNo");
        var injectorFieldId = ComputeExpectedFieldId(featureId, 1, injectorDepId, "serialNo");

        var runId = await SeedBlockingRunAsync(configId, stepId);

        // Simultaneously: exclude the body (removal — blocked by the run) and include the
        // injector (addition — always safe).
        await UpdateInclusionsAsync(configId, featureId, new Dictionary<string, bool> { [bodyDepId] = false, [injectorDepId] = true });
        var second = await SyncAsync(client, configId);

        Assert.Empty(second.Updated);
        var blockedItem = Assert.Single(second.Blocked);
        Assert.Equal(stepId, blockedItem.StepId);
        Assert.Contains(blockedItem.BlockingRuns!, r => r.RunId == runId);
        Assert.NotNull(blockedItem.AppliedFieldIds);
        Assert.Contains(injectorFieldId, blockedItem.AppliedFieldIds!);
        Assert.NotNull(blockedItem.BlockedFieldIds);
        Assert.Contains(bodyFieldId, blockedItem.BlockedFieldIds!);

        // The addition was actually persisted even though the removal wasn't.
        var stepsAfter = await GetStepsJsonAsync(configId);
        var fieldIds = CaptureFieldIds(stepsAfter.Single(s => s.GetProperty("id").GetString() == stepId));
        Assert.Contains(injectorFieldId, fieldIds); // added
        Assert.Contains(bodyFieldId, fieldIds); // blocked removal — still present
    }

    // WF-5: POST .../sync-feature-steps/preview must never persist — it runs the exact same
    // ReconcileFeatureStepsAsync as apply, computing what WOULD add/update/remove, but StepsJson
    // on disk must be completely unchanged afterward.
    [Fact]
    public async Task Preview_does_not_persist_StepsJson()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, _, _) = await SeedFeatureConfigAsync(
            quantity: 2, deps: new[] { new DepSpec("Camera Unit", true, new[] { "serialNo" }) });

        var stepsBefore = await GetStepsJsonAsync(configId);
        Assert.Empty(stepsBefore); // nothing generated yet

        var preview = await PreviewAsync(client, configId);
        Assert.Equal(2, preview.Added.Count); // preview reports what WOULD be added...

        var stepsAfter = await GetStepsJsonAsync(configId);
        Assert.Empty(stepsAfter); // ...but nothing was actually written.
    }

    // WF-5: the preview must run the same run-safety check as apply, so an admin sees a blocked
    // removal BEFORE ever calling apply — not discover it only after confirming.
    [Fact]
    public async Task Preview_reports_run_blocked_removals_before_any_apply_call()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, featureId, _) = await SeedFeatureConfigAsync(
            quantity: 2, deps: new[] { new DepSpec("Camera Unit", true, new[] { "serialNo" }) });

        var first = await SyncAsync(client, configId); // establish real generated steps
        var unit2StepId = first.Added.Single(i => i.UnitIndex == 2).StepId;
        var runId = await SeedBlockingRunAsync(configId, unit2StepId);

        await UpdateQuantityAsync(configId, featureId, 1); // wants to remove unit 2 — will be blocked

        var preview = await PreviewAsync(client, configId);

        var blockedItem = Assert.Single(preview.Blocked);
        Assert.Equal(unit2StepId, blockedItem.StepId);
        Assert.Contains(blockedItem.BlockingRuns!, r => r.RunId == runId);
        Assert.Empty(preview.Removed);

        // Still nothing persisted by the preview call.
        var stepsAfter = await GetStepsJsonAsync(configId);
        Assert.Contains(stepsAfter, s => s.GetProperty("id").GetString() == unit2StepId);
    }

    // WF-5: custom/manual steps must never appear in the authoritative preview, matching apply's
    // own scope exactly (same shared implementation).
    [Fact]
    public async Task Custom_steps_are_absent_from_the_preview()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, _, _) = await SeedFeatureConfigAsync(
            quantity: 1, deps: new[] { new DepSpec("Camera Unit", true, new[] { "serialNo" }) });

        var customStep = new
        {
            id = "custom-prep-step",
            order = 0,
            title = "Preparation & Permits",
            description = "Manually authored.",
            overrideInReport = false,
            overrideReportText = "",
            includeDescriptionInReport = true,
            mediaIds = Array.Empty<string>(),
            decisionsEnabled = false,
            decisions = Array.Empty<object>(),
            inputs = Array.Empty<object>(),
            nextStepId = (string?)null,
            captureFields = Array.Empty<object>(),
            stepType = "preparation",
        };
        await SetStepsJsonAsync(configId, JsonSerializer.Serialize(new[] { customStep }, JsonOpts));

        var preview = await PreviewAsync(client, configId);

        Assert.DoesNotContain(preview.Added, i => i.StepId == "custom-prep-step");
        Assert.DoesNotContain(preview.Updated, i => i.StepId == "custom-prep-step");
        Assert.DoesNotContain(preview.Removed, i => i.StepId == "custom-prep-step");
        Assert.DoesNotContain(preview.Unchanged, i => i.StepId == "custom-prep-step");
        Assert.DoesNotContain(preview.Blocked, i => i.StepId == "custom-prep-step");
    }

    // WF-5: apply must recompute independently of any earlier preview — if state changes between
    // preview and confirm (here: a blocking run appears after the preview was taken), apply must
    // reflect the NEW state, not a stale cached preview result.
    [Fact]
    public async Task Apply_recalculates_independently_of_an_earlier_preview()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, featureId, _) = await SeedFeatureConfigAsync(
            quantity: 2, deps: new[] { new DepSpec("Camera Unit", true, new[] { "serialNo" }) });

        var first = await SyncAsync(client, configId);
        var unit2StepId = first.Added.Single(i => i.UnitIndex == 2).StepId;

        await UpdateQuantityAsync(configId, featureId, 1); // wants to remove unit 2

        // Preview BEFORE any run exists — reports a clean removal, nothing blocked.
        var preview = await PreviewAsync(client, configId);
        Assert.Contains(preview.Removed, i => i.StepId == unit2StepId);
        Assert.Empty(preview.Blocked);

        // State changes after the preview was taken.
        var runId = await SeedBlockingRunAsync(configId, unit2StepId);

        // Apply must recompute fresh, not trust the earlier (now-stale) preview.
        var applied = await SyncAsync(client, configId);
        Assert.Empty(applied.Removed);
        var blockedItem = Assert.Single(applied.Blocked);
        Assert.Equal(unit2StepId, blockedItem.StepId);
        Assert.Contains(blockedItem.BlockingRuns!, r => r.RunId == runId);

        var stepsAfter = await GetStepsJsonAsync(configId);
        Assert.Contains(stepsAfter, s => s.GetProperty("id").GetString() == unit2StepId);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private record DepSpec(string Name, bool IsInventory, string[] CaptureFields);

    private record SyncResult(
        List<SyncFeatureStepItemDto> Added,
        List<SyncFeatureStepItemDto> Updated,
        List<SyncFeatureStepItemDto> Removed,
        List<SyncFeatureStepItemDto> Unchanged,
        List<SyncFeatureStepItemDto> Blocked);

    private static List<string> CaptureFieldIds(JsonElement step) =>
        step.GetProperty("captureFields").EnumerateArray().Select(f => f.GetProperty("id").GetString()!).ToList();

    private static string ComputeExpectedFieldId(string featureId, int unitIndex, string dependencyId, string fieldKey)
    {
        var seed = $"field:{featureId}:unit:{unitIndex}:dep:{dependencyId}:key:{fieldKey}";
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(seed));
        return new Guid(hash[..16]).ToString();
    }

    private async Task<SyncResult> SyncAsync(HttpClient client, string configId)
    {
        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/sync-feature-steps", null);
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadAsStringAsync();
        var dto = JsonSerializer.Deserialize<SyncFeatureStepsResultDto>(body, JsonOpts)!;
        return new SyncResult(dto.Added, dto.Updated, dto.Removed, dto.Unchanged, dto.Blocked);
    }

    private async Task<SyncResult> PreviewAsync(HttpClient client, string configId)
    {
        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/sync-feature-steps/preview", null);
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadAsStringAsync();
        var dto = JsonSerializer.Deserialize<SyncFeatureStepsResultDto>(body, JsonOpts)!;
        return new SyncResult(dto.Added, dto.Updated, dto.Removed, dto.Unchanged, dto.Blocked);
    }

    private async Task<List<JsonElement>> GetStepsJsonAsync(string configId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entity = await db.WorkflowConfigs.FirstAsync(c => c.Id == configId);
        return JsonSerializer.Deserialize<List<JsonElement>>(entity.StepsJson, JsonOpts) ?? new();
    }

    private async Task SetStepsJsonAsync(string configId, string stepsJson)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entity = await db.WorkflowConfigs.FirstAsync(c => c.Id == configId);
        entity.StepsJson = stepsJson;
        await db.SaveChangesAsync();
    }

    private async Task UpdateQuantityAsync(string configId, string featureId, int quantity)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cf = await db.WorkflowConfigFeatures.FirstAsync(f => f.WorkflowConfigId == configId && f.FeatureId == featureId);
        cf.Quantity = quantity;
        await db.SaveChangesAsync();
    }

    private async Task UpdateInclusionsAsync(string configId, string featureId, Dictionary<string, bool> inclusions)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cf = await db.WorkflowConfigFeatures.FirstAsync(f => f.WorkflowConfigId == configId && f.FeatureId == featureId);
        cf.InclusionsJson = JsonSerializer.Serialize(inclusions);
        await db.SaveChangesAsync();
    }

    /// <summary>Seeds a run whose immutable WorkflowSnapshotJson references stepId — the real
    /// run-safety signal (see FindBlockingRunsAsync/SnapshotContainsStep) — mirroring the exact
    /// two-stage shape AssetWorkflowRunsController builds at run start: an outer object whose
    /// `stepsJson` property is itself a still-serialized JSON string. StepResultsJson is
    /// deliberately EMPTY by default (no captured value for the step) to prove blocking does not
    /// require one; pass hasResult: true only for a test that explicitly wants both.</summary>
    private async Task<string> SeedBlockingRunAsync(string configId, string stepId, bool isLocked = false, bool hasResult = false)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var config = await db.WorkflowConfigs.FirstAsync(c => c.Id == configId);
        var runId = Guid.NewGuid().ToString("N");
        var assetId = Guid.NewGuid().ToString("N");
        var snapshotStepsJson = JsonSerializer.Serialize(new[] { new { id = stepId } });
        var snapshotJson = JsonSerializer.Serialize(new { id = configId, name = config.Name, stepsJson = snapshotStepsJson });
        db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
        {
            Id = runId,
            AssetId = assetId,
            WorkflowConfigId = configId,
            WorkflowVersion = config.Version,
            WorkflowSnapshotJson = snapshotJson,
            Status = "InProgress",
            IsLocked = isLocked,
            StepResultsJson = hasResult
                ? JsonSerializer.Serialize(new[]
                {
                    new { stepId, values = new Dictionary<string, string>(), completedAt = DateTime.UtcNow.ToString("O") },
                })
                : "[]",
        });
        await db.SaveChangesAsync();
        return runId;
    }

    private async Task<string> AddSecondFeatureAsync(string configId, int quantity, DepSpec[] deps)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var featureId = Guid.NewGuid().ToString("N");
        db.Features.Add(new FeatureEntity { Id = featureId, Name = "Feature B", ValueType = "component" });

        var sortOrder = 0;
        var depIds = new List<string>();
        foreach (var spec in deps)
        {
            var depId = Guid.NewGuid().ToString("N");
            depIds.Add(depId);
            db.FeatureDependencies.Add(new FeatureDependencyEntity
            {
                Id = depId,
                FeatureId = featureId,
                Name = spec.Name,
                IsInventory = spec.IsInventory,
                CaptureFieldsJson = JsonSerializer.Serialize(spec.CaptureFields),
                SortOrder = sortOrder++,
            });
        }

        db.WorkflowConfigFeatures.Add(new WorkflowConfigFeatureEntity
        {
            Id = Guid.NewGuid().ToString("N"),
            WorkflowConfigId = configId,
            FeatureId = featureId,
            Quantity = quantity,
            InclusionsJson = "{" + string.Join(",", depIds.Select(id => $"\"{id}\":true")) + "}",
        });

        await db.SaveChangesAsync();
        return featureId;
    }

    private async Task<(string configId, string featureId, Dictionary<string, string> depIdByName)> SeedFeatureConfigAsync(
        int quantity, DepSpec[] deps)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;

        var featureId = Guid.NewGuid().ToString("N");
        db.Features.Add(new FeatureEntity { Id = featureId, Name = "Test Camera", ValueType = "component" });

        var depIdByName = new Dictionary<string, string>();
        var sortOrder = 0;
        foreach (var spec in deps)
        {
            var depId = Guid.NewGuid().ToString("N");
            depIdByName[spec.Name] = depId;
            db.FeatureDependencies.Add(new FeatureDependencyEntity
            {
                Id = depId,
                FeatureId = featureId,
                Name = spec.Name,
                IsInventory = spec.IsInventory,
                CaptureFieldsJson = JsonSerializer.Serialize(spec.CaptureFields),
                SortOrder = sortOrder++,
            });
        }

        var inclusionsJson = "{" + string.Join(",", depIdByName.Values.Select(id => $"\"{id}\":true")) + "}";

        var configId = Guid.NewGuid().ToString("N");
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = configId,
            ProductId = "prod-test",
            Name = "Sync Feature Steps Draft",
            Status = "Draft",
            WorkflowTypeId = "wftype-installation",
            Version = 1,
            StepsJson = "[]",
            MediaJson = "[]",
            FeatureSelectionsJson = "[]",
            CreatedAt = now,
            UpdatedAt = now,
        });

        db.WorkflowConfigFeatures.Add(new WorkflowConfigFeatureEntity
        {
            Id = Guid.NewGuid().ToString("N"),
            WorkflowConfigId = configId,
            FeatureId = featureId,
            Quantity = quantity,
            InclusionsJson = inclusionsJson,
        });

        await db.SaveChangesAsync();
        return (configId, featureId, depIdByName);
    }

    private static async Task<HttpClient> CreateAuthenticatedClientAsync(ApiTestFactory factory)
    {
        var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin.dev@stratango.local",
            password = "Admin123!",
        });
        login.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        var token = doc.RootElement.GetProperty("token").GetString()!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private Task<HttpClient> CreateAuthenticatedClientAsync() => CreateAuthenticatedClientAsync(_factory);
}
