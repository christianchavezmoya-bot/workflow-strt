using System.Linq;
using System.Text.Json.Nodes;
using Commtrac.Api.Services;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>Rules of RunIssueMerge in isolation (endpoint behaviour: RunIssuePreservationTests).</summary>
public class RunIssueMergeTests
{
    private const string Pm = "pm-1";
    private const string Installer = "inst-1";

    private static JsonArray Arr(string json) => (JsonArray)JsonNode.Parse(json)!;
    private static JsonObject? ById(string json, string id) => Arr(json).OfType<JsonObject>().FirstOrDefault(o => (string?)o["id"] == id);

    private const string RecordedBlocking = """[{"id":"b1","isBlocking":true,"resolved":false,"createdByUserId":"pm-1","comments":[{"id":"c1","text":"PM note"}]}]""";

    [Fact]
    public void Omitted_recorded_issues_are_kept_and_reported()
    {
        var r = RunIssueMerge.Merge(RecordedBlocking, """[{"id":"n1","isBlocking":false,"resolved":false}]""", null, Installer, false);
        Assert.Empty(r.Refusals);
        Assert.Equal(new[] { "b1" }, r.PreservedOmittedIds);
        Assert.NotNull(ById(r.Json, "b1"));
        Assert.NotNull(ById(r.Json, "n1"));
        Assert.Equal(1, r.OpenBlockingCount);
    }

    [Fact]
    public void Explicit_delete_of_someone_elses_open_blocking_issue_is_refused()
    {
        var r = RunIssueMerge.Merge(RecordedBlocking, "[]", new[] { "b1" }, Installer, false);
        Assert.Equal("b1", Assert.Single(r.Refusals).IssueId);
        Assert.Empty(r.DeletedIds);
    }

    [Theory]
    [InlineData(Pm, false)]      // its creator
    [InlineData("admin-9", true)] // Admin / Project Manager
    public void Explicit_delete_by_creator_or_manager_is_allowed(string actor, bool manages)
    {
        var r = RunIssueMerge.Merge(RecordedBlocking, "[]", new[] { "b1" }, actor, manages);
        Assert.Empty(r.Refusals);
        Assert.Equal(new[] { "b1" }, r.DeletedIds);
        Assert.Equal("[]", r.Json);
    }

    [Fact]
    public void Explicit_delete_of_a_non_blocking_or_resolved_issue_is_allowed_for_anyone()
    {
        const string recorded = """[{"id":"o1","isBlocking":false,"resolved":false},{"id":"b2","isBlocking":true,"resolved":true}]""";
        var r = RunIssueMerge.Merge(recorded, "[]", new[] { "o1", "b2" }, Installer, false);
        Assert.Empty(r.Refusals);
        Assert.Equal(new[] { "o1", "b2" }, r.DeletedIds);
    }

    [Fact]
    public void Downgrading_someone_elses_open_blocking_issue_is_refused_but_resolving_it_is_allowed()
    {
        var downgrade = RunIssueMerge.Merge(RecordedBlocking, """[{"id":"b1","isBlocking":false,"resolved":false,"severity":"low"}]""", null, Installer, false);
        Assert.Equal("b1", Assert.Single(downgrade.Refusals).IssueId);

        var resolve = RunIssueMerge.Merge(RecordedBlocking, """[{"id":"b1","isBlocking":true,"resolved":true,"resolutionNote":"fixed"}]""", null, Installer, false);
        Assert.Empty(resolve.Refusals);
        Assert.Equal(0, resolve.OpenBlockingCount);
    }

    [Fact]
    public void A_recorded_resolution_is_never_undone_and_comments_and_media_are_combined()
    {
        const string recorded = """[{"id":"b1","isBlocking":true,"resolved":true,"resolutionNote":"re-terminated","resolvedBy":"PM","resolutionMedia":["m1"],"reportMedia":["r1"],"comments":[{"id":"c1","text":"PM"}]}]""";
        const string stalePhone = """[{"id":"b1","isBlocking":true,"resolved":false,"reportMedia":["r1","r2"],"comments":[{"id":"c1","text":"PM"},{"id":"c2","text":"tech"}]}]""";
        var r = RunIssueMerge.Merge(recorded, stalePhone, null, Installer, false);
        var b1 = ById(r.Json, "b1")!;
        Assert.Empty(r.Refusals);
        Assert.True((bool)b1["resolved"]!);
        Assert.Equal("re-terminated", (string?)b1["resolutionNote"]);
        Assert.Equal(new[] { "m1" }, ((JsonArray)b1["resolutionMedia"]!).Select(n => (string?)n));
        Assert.Equal(new[] { "r1", "r2" }, ((JsonArray)b1["reportMedia"]!).Select(n => (string?)n));
        Assert.Equal(new[] { "c1", "c2" }, ((JsonArray)b1["comments"]!).Select(n => (string?)n!["id"]));
        Assert.Equal(0, r.OpenBlockingCount);
    }

    [Fact]
    public void Creator_provenance_comes_from_the_server_never_from_the_client()
    {
        // A new issue claims another creator; an existing one tries to rewrite its creator.
        const string payload = """[{"id":"b1","isBlocking":true,"resolved":false,"createdByUserId":"inst-1"},{"id":"n1","createdByUserId":"pm-1"}]""";
        var r = RunIssueMerge.Merge(RecordedBlocking, payload, null, Installer, false);
        Assert.Equal("pm-1", (string?)ById(r.Json, "b1")![RunIssueMerge.CreatedByUserIdKey]);
        Assert.Equal("inst-1", (string?)ById(r.Json, "n1")![RunIssueMerge.CreatedByUserIdKey]);

        // …so the rewrite can't be used to then delete the PM's blocking issue.
        var delete = RunIssueMerge.Merge(r.Json, "[]", new[] { "b1" }, Installer, false);
        Assert.Single(delete.Refusals);
    }

    [Fact]
    public void Issues_without_a_recorded_creator_count_as_not_owned_by_a_field_user()
    {
        const string legacy = """[{"id":"b1","isBlocking":true,"resolved":false}]""";
        Assert.Single(RunIssueMerge.Merge(legacy, "[]", new[] { "b1" }, Installer, false).Refusals);
        Assert.Empty(RunIssueMerge.Merge(legacy, "[]", new[] { "b1" }, "pm-9", true).Refusals);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("""{"id":"x"}""")]                                   // not an array
    [InlineData("""["just a string"]""")]                           // entry not an object
    [InlineData("""[{"description":"no id"}]""")]                    // missing id
    [InlineData("""[{"id":""}]""")]                                  // empty id
    [InlineData("""[{"id":7}]""")]                                   // id not a string
    [InlineData("""[{"id":"a"},{"id":"a"}]""")]                      // duplicate id
    [InlineData("""[{"id":"a","isBlocking":"true"}]""")]             // isBlocking not boolean
    [InlineData("""[{"id":"a","isBlocking":true,"resolved":1}]""")]  // resolved not boolean
    public void A_malformed_client_list_is_rejected_and_nothing_is_merged(string payload)
    {
        var r = RunIssueMerge.Merge(RecordedBlocking, payload, null, Installer, true);
        Assert.True(r.Rejected);
        Assert.NotNull(r.ClientInvalidReason);
        Assert.Equal(RecordedBlocking, r.Json);
        Assert.Empty(r.DeletedIds);
    }

    [Fact]
    public void Blank_deleted_ids_are_rejected()
    {
        var r = RunIssueMerge.Merge(RecordedBlocking, "[]", new[] { "" }, Pm, true);
        Assert.NotNull(r.ClientInvalidReason);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("""{"id":"b1"}""")]
    public void An_unreadable_recorded_list_fails_closed_and_is_never_replaced(string stored)
    {
        // Even an Admin/PM with a valid payload can't overwrite it.
        var r = RunIssueMerge.Merge(stored, """[{"id":"n1","isBlocking":false,"resolved":false}]""", new[] { "b1" }, Pm, true);
        Assert.True(r.StoredUnreadable);
        Assert.True(r.Rejected);
        Assert.Equal(stored, r.Json);
        Assert.Empty(r.DeletedIds);
    }

    [Fact]
    public void An_allowed_downgrade_is_reported_for_auditing()
    {
        var r = RunIssueMerge.Merge(RecordedBlocking, """[{"id":"b1","isBlocking":false,"resolved":false,"severity":"low"}]""", null, Pm, false);
        Assert.Empty(r.Refusals);
        Assert.Equal(new[] { "b1" }, r.DowngradedIds);
    }

    [Fact]
    public void Same_id_client_content_wins_for_ordinary_fields_and_order_follows_the_client()
    {
        const string recorded = """[{"id":"a","description":"old"},{"id":"b","description":"kept"}]""";
        var r = RunIssueMerge.Merge(recorded, """[{"id":"n","description":"new"},{"id":"a","description":"edited"}]""", null, Installer, false);
        var ids = Arr(r.Json).Select(n => (string?)n!["id"]).ToArray();
        Assert.Equal(new[] { "n", "a", "b" }, ids);
        Assert.Equal("edited", (string?)ById(r.Json, "a")!["description"]);
    }

    [Fact]
    public void Deleting_an_id_the_server_never_had_is_a_harmless_no_op()
    {
        var r = RunIssueMerge.Merge("[]", """[{"id":"n1"}]""", new[] { "ghost" }, Installer, false);
        Assert.Empty(r.Refusals);
        Assert.Empty(r.DeletedIds);
        Assert.NotNull(ById(r.Json, "n1"));
    }
}
