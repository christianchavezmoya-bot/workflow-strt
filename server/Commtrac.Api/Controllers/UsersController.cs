using BCrypt.Net;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using System.Security.Cryptography;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IEmailSender _emailSender;
    private readonly NotificationSettingsService _notificationSettings;
    private readonly OfficeNormalizationService _officeNormalization;

    public UsersController(
        AppDbContext db,
        IEmailSender emailSender,
        NotificationSettingsService notificationSettings,
        OfficeNormalizationService officeNormalization)
    {
        _db = db;
        _emailSender = emailSender;
        _notificationSettings = notificationSettings;
        _officeNormalization = officeNormalization;
    }

    [HttpGet]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<IEnumerable<UserDto>>> GetAll()
    {
        var users = await _db.Users.OrderBy(u => u.FullName).ToListAsync();
        if (await _officeNormalization.NormalizeUserOfficesAsync(users) > 0)
        {
            await _db.SaveChangesAsync();
        }
        return Ok(users.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<UserDto>> Create([FromBody] CreateUserRequest request)
    {
        var user = new UserEntity
        {
            Email = request.Email,
            FullName = request.FullName,
            Role = request.Role,
            Office = await _officeNormalization.NormalizeOfficeAsync(request.Office),
            IsActive = true,
            IsFirstLogin = true,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Temp123!")
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAll), new { id = user.Id }, ToDto(user));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<UserDto>> Update(string id, [FromBody] UpdateUserRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null)
        {
            return NotFound();
        }

        if (!string.IsNullOrWhiteSpace(request.FullName)) user.FullName = request.FullName;
        if (!string.IsNullOrWhiteSpace(request.Email)) user.Email = request.Email;
        if (!string.IsNullOrWhiteSpace(request.Role)) user.Role = request.Role;
        if (!string.IsNullOrWhiteSpace(request.Office)) user.Office = await _officeNormalization.NormalizeOfficeAsync(request.Office);
        if (request.IsActive.HasValue) user.IsActive = request.IsActive.Value;
        if (request.IsFirstLogin.HasValue) user.IsFirstLogin = request.IsFirstLogin.Value;
        if (!string.IsNullOrWhiteSpace(request.Password))
        {
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        }

        await _db.SaveChangesAsync();
        return Ok(ToDto(user));
    }

    [HttpPatch("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<UserDto>> Patch(string id, [FromBody] UpdateUserRequest request)
    {
        return await Update(id, request);
    }

    [HttpPost("bulk-import")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<BulkImportUsersResult>> BulkImport([FromBody] BulkImportUsersRequest request)
    {
        var created = 0;
        var skippedEmails = new List<string>();
        var errors = new List<string>();

        var existingEmails = new HashSet<string>(
            await _db.Users.Select(u => u.Email.ToLower()).ToListAsync()
        );

        foreach (var row in request.Users)
        {
            if (string.IsNullOrWhiteSpace(row.FullName) || string.IsNullOrWhiteSpace(row.Email) || string.IsNullOrWhiteSpace(row.Role))
            {
                errors.Add($"Row skipped — missing required field (fullName, email, or role): '{row.Email}'");
                continue;
            }

            var emailLower = row.Email.Trim().ToLower();
            if (existingEmails.Contains(emailLower))
            {
                skippedEmails.Add(row.Email.Trim());
                continue;
            }

            try
            {
                var user = new UserEntity
                {
                    Email = row.Email.Trim(),
                    FullName = row.FullName.Trim(),
                    Role = row.Role.Trim(),
                    Office = await _officeNormalization.NormalizeOfficeAsync(row.Office),
                    IsActive = false,
                    IsFirstLogin = true,
                    PasswordHash = string.Empty  // no password — inactive users can't log in
                };
                _db.Users.Add(user);
                existingEmails.Add(emailLower);
                created++;
            }
            catch (Exception ex)
            {
                errors.Add($"Failed to create '{row.Email}': {ex.Message}");
            }
        }

        await _db.SaveChangesAsync();

        return Ok(new BulkImportUsersResult(created, skippedEmails.Count, skippedEmails, errors));
    }

    [HttpPost("{id}/invite")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Invite(string id)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null)
        {
            return NotFound();
        }

        var token = GenerateToken();
        user.ResetToken = token;
        user.ResetTokenExpiresUtc = DateTime.UtcNow.AddHours(24);
        user.IsFirstLogin = true;
        user.IsActive = false;
        await _db.SaveChangesAsync();

        var emailSettings = await _notificationSettings.GetEmailSettingsAsync();
        var baseUrl = ResolveFrontendBaseUrl(emailSettings.FrontendBaseUrl);
        var link = $"{baseUrl}/reset-password?token={Uri.EscapeDataString(token)}&invite=true";
        try
        {
            await _emailSender.SendInviteAsync(user.Email, link);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message, inviteLink = link });
        }
        return NoContent();
    }

    [HttpPost("{id}/reset-2fa")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<UserDto>> Reset2fa(string id)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null)
        {
            return NotFound();
        }

        user.Is2faEnabled = false;
        user.TotpSecret = null;
        user.RecoveryCodesJson = null;
        await _db.SaveChangesAsync();

        // Audit log: admin reset 2FA
        var adminId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "unknown";
        var adminEmail = User.FindFirstValue(ClaimTypes.Email) ?? "unknown";
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        _db.AuditLogs.Add(new AuditLogEntity
        {
            UserId = adminId,
            UserEmail = adminEmail,
            Action = "2fa_admin_reset",
            Details = $"Reset 2FA for user {user.Email} ({user.Id})",
            IpAddress = ip
        });
        await _db.SaveChangesAsync();

        return Ok(ToDto(user));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null)
        {
            return NotFound();
        }

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static UserDto ToDto(UserEntity user)
    {
        var codesRemaining = 0;
        if (!string.IsNullOrEmpty(user.RecoveryCodesJson))
        {
            try { codesRemaining = System.Text.Json.JsonSerializer.Deserialize<List<string>>(user.RecoveryCodesJson)?.Count ?? 0; } catch { }
        }
        return new UserDto(
            user.Id,
            user.Email,
            user.FullName,
            user.Role,
            user.Office,
            user.IsActive,
            user.IsFirstLogin,
            user.Is2faEnabled,
            codesRemaining
        );
    }

    private static string GenerateToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes);
    }

    private string ResolveFrontendBaseUrl(string? configuredBaseUrl)
    {
        var configured = (configuredBaseUrl ?? string.Empty).Trim().TrimEnd('/');

        if (!string.IsNullOrWhiteSpace(configured) && !IsLocalhostUrl(configured))
        {
            return configured;
        }

        var origin = Request.Headers.Origin.ToString().Trim().TrimEnd('/');
        if (Uri.TryCreate(origin, UriKind.Absolute, out var originUri))
        {
            return $"{originUri.Scheme}://{originUri.Authority}";
        }

        var referer = Request.Headers.Referer.ToString().Trim();
        if (Uri.TryCreate(referer, UriKind.Absolute, out var refererUri))
        {
            return $"{refererUri.Scheme}://{refererUri.Authority}";
        }

        if (Uri.TryCreate(configured, UriKind.Absolute, out var configuredUri))
        {
            return $"{configuredUri.Scheme}://{configuredUri.Authority}";
        }

        return $"{Request.Scheme}://{Request.Host.Value}";
    }

    private static bool IsLocalhostUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return false;
        }

        var host = uri.Host.ToLowerInvariant();
        return host == "localhost" || host == "127.0.0.1" || host == "::1";
    }
}
