using System.Security.Claims;
using System.Text.Json;
using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Services;

/// <summary>
/// Server-side reader for the Tier-2 role permissions an admin edits in Admin → Roles.
///
/// Why this exists: authorization on this API is expressed as static
/// [Authorize(Roles = "...")] attributes, which cannot see the saved role config. That is
/// how the frontend ended up offering actions the server refused — the config said one
/// thing and the attribute another. For the areas the config genuinely drives (BOM,
/// analytics) this service closes the gap, so ticking a box in the role editor has real
/// effect instead of only hiding a button.
///
/// The stored shape mirrors the TypeScript DomainPermissions:
///   { "&lt;RoleName&gt;": { "domains": { "&lt;area&gt;": { "&lt;action&gt;": true|false } } } }
/// </summary>
public class RolePermissionService
{
    private readonly AppDbContext _db;

    public RolePermissionService(AppDbContext db) => _db = db;

    /// <summary>Roles that hold every area by default when no config has been saved.
    /// Mirrors defaultDomains() in roleConfigService.ts, which derives BOM and analytics
    /// rights from createDeleteTables — the flag only these two roles carry.</summary>
    private static readonly string[] DefaultFullAccessRoles = { "Admin", "Project Manager" };

    public static string? RoleOf(ClaimsPrincipal user) =>
        // MapInboundClaims is off, so the short "role" claim is the real one; fall back to
        // the long WS-Federation URI for tokens minted before that change.
        user.FindFirst("role")?.Value ?? user.FindFirstValue(ClaimTypes.Role);

    /// <summary>
    /// True when the signed-in user's role grants <paramref name="action"/> on
    /// <paramref name="area"/>. Falls back to the Admin/Project Manager default when the
    /// config has no opinion, so an unconfigured install behaves exactly as before.
    /// </summary>
    public async Task<bool> HasAsync(ClaimsPrincipal user, string area, string action, CancellationToken ct = default)
    {
        var role = RoleOf(user);
        if (string.IsNullOrWhiteSpace(role)) return false;

        var fallback = DefaultFullAccessRoles.Contains(role);

        var config = await _db.RoleConfigs.AsNoTracking().FirstOrDefaultAsync(ct);
        if (config == null || string.IsNullOrWhiteSpace(config.ConfigJson) || config.ConfigJson == "{}")
            return fallback;

        try
        {
            using var doc = JsonDocument.Parse(config.ConfigJson);
            if (!doc.RootElement.TryGetProperty(role, out var roleEl)) return fallback;

            // A view-only role can never hold a write, whatever the config says — the same
            // hard-lock usePermissions applies on the client.
            var isViewOnly = roleEl.TryGetProperty("viewOnly", out var vo)
                             && vo.ValueKind == JsonValueKind.True;
            if (isViewOnly && !action.Equals("view", StringComparison.OrdinalIgnoreCase)) return false;

            if (!roleEl.TryGetProperty("domains", out var domains)) return fallback;
            if (!domains.TryGetProperty(area, out var areaEl)) return fallback;
            if (!areaEl.TryGetProperty(action, out var flag)) return fallback;

            return flag.ValueKind == JsonValueKind.True;
        }
        catch (JsonException)
        {
            // A corrupt config must not hand out access it cannot substantiate, nor lock
            // out the roles that always had it.
            return fallback;
        }
    }
}
