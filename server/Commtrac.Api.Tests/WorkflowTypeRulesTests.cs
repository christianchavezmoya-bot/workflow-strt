using Commtrac.Api.Models;
using Commtrac.Api.Services;

namespace Commtrac.Api.Tests;

public class WorkflowTypeRulesTests
{
    private static WorkflowTypeEntity Type(string id, string name) =>
        new() { Id = id, Name = name, IsActive = true };

    [Theory]
    [InlineData("wftype-inspection", "Inspection", true)]
    [InlineData("wftype-installation", "Installation", false)]
    [InlineData("custom-repair", "Repair", false)]
    [InlineData("custom-commission", "Commissioning", false)]
    public void DeriveWorkflowMode_maps_inspection_to_inspection_only(string id, string name, bool expectInspection)
    {
        var mode = WorkflowTypeRules.DeriveWorkflowMode(Type(id, name));
        Assert.Equal(expectInspection ? "INSPECTION_ONLY" : "INSTALLATION_ONLY", mode);
    }

    [Theory]
    [InlineData("INSPECTION_ONLY", "wftype-inspection")]
    [InlineData("INSTALLATION_ONLY", "wftype-installation")]
    [InlineData("MIXED", null)]
    public void DefaultTypeIdForLegacyMode_backfills_non_mixed_modes(string mode, string? expected)
    {
        Assert.Equal(expected, WorkflowTypeRules.DefaultTypeIdForLegacyMode(mode));
    }

    [Fact]
    public void ResolveConfigWorkflowTypeId_prefers_explicit_config_type_id()
    {
        var config = new WorkflowConfigEntity
        {
            WorkflowTypeId = "wftype-repair",
            ConfigType = "Installation",
        };
        var resolved = WorkflowTypeRules.ResolveConfigWorkflowTypeId(
            config,
            [Type("wftype-installation", "Installation")]);
        Assert.Equal("wftype-repair", resolved);
    }

    [Fact]
    public void ResolveConfigWorkflowTypeId_falls_back_to_config_type_name()
    {
        var config = new WorkflowConfigEntity { ConfigType = "Commissioning" };
        var resolved = WorkflowTypeRules.ResolveConfigWorkflowTypeId(
            config,
            [Type("wftype-commissioning", "Commissioning")]);
        Assert.Equal("wftype-commissioning", resolved);
    }

    [Fact]
    public void AssignmentAllowedForProject_rejects_mismatch_when_project_has_type()
    {
        Assert.False(WorkflowTypeRules.AssignmentAllowedForProject(
            "wftype-installation", "INSTALLATION_ONLY", "wftype-inspection"));
    }

    [Fact]
    public void AssignmentAllowedForProject_allows_match_when_project_has_type()
    {
        Assert.True(WorkflowTypeRules.AssignmentAllowedForProject(
            "wftype-repair", "INSTALLATION_ONLY", "wftype-repair"));
    }

    [Fact]
    public void AssignmentAllowedForProject_allows_any_type_for_legacy_mixed_without_type()
    {
        Assert.True(WorkflowTypeRules.AssignmentAllowedForProject(
            null, "MIXED", "wftype-inspection"));
        Assert.True(WorkflowTypeRules.AssignmentAllowedForProject(
            null, "MIXED", "wftype-installation"));
    }

    [Fact]
    public void AssignmentAllowedForProject_rejects_when_typed_project_has_null_config_type()
    {
        Assert.False(WorkflowTypeRules.AssignmentAllowedForProject(
            "wftype-installation", "INSTALLATION_ONLY", "wftype-inspection"));
    }
}
