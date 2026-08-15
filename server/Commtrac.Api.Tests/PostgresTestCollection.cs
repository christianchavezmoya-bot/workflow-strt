using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// The Postgres tests each recreate the same throwaway database, so they must not run in parallel.
/// </summary>
[CollectionDefinition(Name, DisableParallelization = true)]
public class PostgresTestCollection
{
    public const string Name = "Postgres";
}
