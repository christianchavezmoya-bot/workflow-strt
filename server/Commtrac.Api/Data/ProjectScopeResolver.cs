using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Data;

public static class ProjectScopeResolver
{
    /// <summary>Map route/query project key (UUID or job number) to canonical Project.Id.</summary>
    public static async Task<string?> ResolveProjectIdAsync(AppDbContext db, string idOrJobNumber)
    {
        if (string.IsNullOrWhiteSpace(idOrJobNumber)) return null;
        var trimmed = idOrJobNumber.Trim();

        var byId = await db.Projects.AsNoTracking()
            .Where(p => p.Id == trimmed)
            .Select(p => p.Id)
            .FirstOrDefaultAsync();
        if (byId != null) return byId;

        return await db.Projects.AsNoTracking()
            .Where(p => p.JobNumber == trimmed)
            .Select(p => p.Id)
            .FirstOrDefaultAsync();
    }
}
