using System;
using System.Linq;
using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Commtrac.Api.Tests;

/// <summary>
/// Points a factory-booted API at a test database.
///
/// Configuration alone cannot do this: Program.cs reads Database:Provider and
/// ConnectionStrings:DefaultConnection while building the host, which runs before
/// WebApplicationFactory appends its own configuration sources. An override there is
/// read too late, so the app keeps the appsettings value — the developer's commtrac.db —
/// while <c>IConfiguration</c> reports the test value. Replacing the registration runs
/// after Program.cs has added its own, so it is the part that actually takes effect.
/// </summary>
internal static class TestDbRegistration
{
    public static void UseTestDatabase(IServiceCollection services, Action<DbContextOptionsBuilder> configure)
    {
        var registrations = services
            .Where(d => d.ServiceType == typeof(DbContextOptions<AppDbContext>)
                        || d.ServiceType == typeof(DbContextOptions)
                        || d.ServiceType == typeof(AppDbContext))
            .ToList();

        foreach (var registration in registrations)
        {
            services.Remove(registration);
        }

        services.AddDbContext<AppDbContext>(configure);
    }
}
