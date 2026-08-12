namespace Commtrac.Api.Models;

public record SyncChangesDto(
    string ServerTime,
    IReadOnlyList<string> ProjectIds,
    IReadOnlyList<string> AssetIds,
    IReadOnlyList<string> RunIds,
    int TotalChanges
);
