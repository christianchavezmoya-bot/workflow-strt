using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Serialises integration tests that boot the real API via <see cref="ApiTestFactory"/>.
/// Parallel factory instances race SqliteBackupService startup against DB teardown on CI.
/// </summary>
[CollectionDefinition(Name, DisableParallelization = true)]
public class ApiTestCollection
{
    public const string Name = "ApiTestCollection";
}
