using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BCrypt.Net;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using OtpNet;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly IEmailSender _emailSender;
    private readonly NotificationSettingsService _notificationSettings;

    // Login rate limiting: max 5 failed attempts per email, 15-minute lockout
    private const int MaxLoginAttempts = 5;
    private static readonly ConcurrentDictionary<string, (int Count, DateTime FirstAttempt)> _loginAttempts = new();

    // 2FA rate limiting: max 5 failed attempts per user, 15-minute lockout
    private const int Max2faAttempts = 5;
    private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);
    private static readonly ConcurrentDictionary<string, (int Count, DateTime FirstAttempt)> _2faAttempts = new();

    public AuthController(AppDbContext db, IConfiguration config, IEmailSender emailSender, NotificationSettingsService notificationSettings)
    {
        _db = db;
        _config = config;
        _emailSender = emailSender;
        _notificationSettings = notificationSettings;
    }

    // Password expiry: 90 days
    private const int PasswordExpiryDays = 90;

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        var emailKey = request.Email.Trim().ToLowerInvariant();

        if (IsLoginLockedOut(emailKey))
        {
            return StatusCode(429, new { message = "Too many failed login attempts. Please wait 15 minutes and try again." });
        }

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower());
        if (user is null || !user.IsActive)
        {
            RecordLoginFailure(emailKey, request.Email);
            await LogAuditEvent(user?.Id ?? "unknown", request.Email, "login_failed", "Invalid credentials or inactive account");
            return Unauthorized();
        }

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            RecordLoginFailure(emailKey, request.Email);
            await LogAuditEvent(user.Id, user.Email, "login_failed", "Invalid password");
            return Unauthorized();
        }

        ClearLoginAttempts(emailKey);

        if (user.Is2faEnabled && !string.IsNullOrEmpty(user.TotpSecret))
        {
            // Check for trusted device token — skip 2FA if valid
            if (!string.IsNullOrEmpty(request.TrustedDeviceToken) &&
                ValidateTrustedDeviceToken(request.TrustedDeviceToken, user.Id))
            {
                var session = await CreateSession(user);
                var fullToken = CreateToken(user, session.Id);
                var fullDto = ToDto(user);
                await LogAuditEvent(user.Id, user.Email, "login_success", "Trusted device (2FA skipped)");
                return Ok(new LoginResponse(fullToken, fullDto, user.IsFirstLogin, PasswordExpired: IsPasswordExpired(user)));
            }

            var twoFactorToken = Create2faToken(user.Id);
            return Ok(new LoginResponse(null, null, user.IsFirstLogin, Requires2fa: true, TwoFactorToken: twoFactorToken));
        }

        var loginSession = await CreateSession(user);
        var token = CreateToken(user, loginSession.Id);
        var dto = ToDto(user);
        await LogAuditEvent(user.Id, user.Email, "login_success");
        return Ok(new LoginResponse(token, dto, user.IsFirstLogin, PasswordExpired: IsPasswordExpired(user)));
    }

    [HttpPost("2fa/login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> TwoFactorLogin([FromBody] TwoFactorLoginRequest request)
    {
        var userId = Validate2faToken(request.TwoFactorToken);
        if (userId is null)
        {
            return Unauthorized();
        }

        if (Is2faLockedOut(userId))
        {
            return StatusCode(429, new { message = "Too many failed attempts. Please try again later." });
        }

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null || !user.IsActive || !user.Is2faEnabled || string.IsNullOrEmpty(user.TotpSecret))
        {
            return Unauthorized();
        }

        var secretBytes = Base32Encoding.ToBytes(user.TotpSecret);
        var totp = new Totp(secretBytes);
        if (!totp.VerifyTotp(request.Code, out _, VerificationWindow.RfcSpecifiedNetworkDelay))
        {
            Record2faFailure(userId);
            await LogAuditEvent(user.Id, user.Email, "2fa_login_failed", "Invalid TOTP code");
            return Unauthorized();
        }

        Clear2faAttempts(userId);
        await LogAuditEvent(user.Id, user.Email, "2fa_login_success");
        var session2fa = await CreateSession(user);
        var token = CreateToken(user, session2fa.Id);
        var dto = ToDto(user);
        var deviceToken = request.RememberDevice ? CreateTrustedDeviceToken(user.Id) : null;
        return Ok(new LoginResponse(token, dto, user.IsFirstLogin, TrustedDeviceToken: deviceToken, PasswordExpired: IsPasswordExpired(user)));
    }

    [HttpPost("2fa/recovery")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> TwoFactorRecovery([FromBody] TwoFactorRecoveryRequest request)
    {
        var userId = Validate2faToken(request.TwoFactorToken);
        if (userId is null)
        {
            return Unauthorized();
        }

        if (Is2faLockedOut(userId))
        {
            return StatusCode(429, new { message = "Too many failed attempts. Please try again later." });
        }

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null || !user.IsActive || string.IsNullOrEmpty(user.RecoveryCodesJson))
        {
            return Unauthorized();
        }

        var codes = JsonSerializer.Deserialize<List<string>>(user.RecoveryCodesJson, JsonOptions) ?? new List<string>();
        var normalizedInput = request.RecoveryCode.Trim().ToUpperInvariant();

        var matchIndex = codes.FindIndex(hash => BCrypt.Net.BCrypt.Verify(normalizedInput, hash));
        if (matchIndex < 0)
        {
            Record2faFailure(userId);
            await LogAuditEvent(user.Id, user.Email, "2fa_recovery_failed", "Invalid recovery code");
            return Unauthorized();
        }

        // Consume the recovery code
        codes.RemoveAt(matchIndex);
        user.RecoveryCodesJson = JsonSerializer.Serialize(codes, JsonOptions);
        await _db.SaveChangesAsync();

        Clear2faAttempts(userId);
        await LogAuditEvent(user.Id, user.Email, "2fa_recovery_used", $"{codes.Count} codes remaining");
        var sessionRec = await CreateSession(user);
        var tokenRec = CreateToken(user, sessionRec.Id);
        var dtoRec = ToDto(user);
        var deviceTokenRec = request.RememberDevice ? CreateTrustedDeviceToken(user.Id) : null;
        return Ok(new LoginResponse(tokenRec, dtoRec, user.IsFirstLogin, TrustedDeviceToken: deviceTokenRec, PasswordExpired: IsPasswordExpired(user)));
    }

    [HttpPost("2fa/setup")]
    [Authorize]
    public async Task<ActionResult<TwoFactorSetupResponse>> Setup2fa()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null) return Unauthorized();

        // Generate a new TOTP secret
        var secret = KeyGeneration.GenerateRandomKey(20);
        var base32Secret = Base32Encoding.ToString(secret);

        // Store it (not yet enabled — user must confirm with a valid code)
        user.TotpSecret = base32Secret;
        await _db.SaveChangesAsync();

        var issuer = Uri.EscapeDataString("Commtrac");
        var account = Uri.EscapeDataString(user.Email);
        var qrCodeUri = $"otpauth://totp/{issuer}:{account}?secret={base32Secret}&issuer={issuer}&digits=6&period=30";

        return Ok(new TwoFactorSetupResponse(base32Secret, qrCodeUri));
    }

    [HttpPost("2fa/confirm")]
    [Authorize]
    public async Task<ActionResult<RecoveryCodesResponse>> Confirm2fa([FromBody] TwoFactorVerifyRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null || string.IsNullOrEmpty(user.TotpSecret)) return BadRequest();

        // Verify the code matches before enabling
        var secretBytes = Base32Encoding.ToBytes(user.TotpSecret);
        var totp = new Totp(secretBytes);
        if (!totp.VerifyTotp(request.Code, out _, VerificationWindow.RfcSpecifiedNetworkDelay))
        {
            return BadRequest();
        }

        // Generate recovery codes
        var plainCodes = GenerateRecoveryCodes(10);
        var hashedCodes = plainCodes.Select(c => BCrypt.Net.BCrypt.HashPassword(c)).ToList();

        user.Is2faEnabled = true;
        user.RecoveryCodesJson = JsonSerializer.Serialize(hashedCodes, JsonOptions);
        await _db.SaveChangesAsync();

        await LogAuditEvent(user.Id, user.Email, "2fa_enabled");
        return Ok(new RecoveryCodesResponse(plainCodes));
    }

    [HttpPost("2fa/disable")]
    [Authorize]
    public async Task<IActionResult> Disable2fa([FromBody] TwoFactorDisableRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null) return Unauthorized();

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            return BadRequest();
        }

        user.Is2faEnabled = false;
        user.TotpSecret = null;
        user.RecoveryCodesJson = null;
        await _db.SaveChangesAsync();

        await LogAuditEvent(user.Id, user.Email, "2fa_disabled");
        return NoContent();
    }

    [HttpPost("2fa/regenerate-codes")]
    [Authorize]
    public async Task<ActionResult<RecoveryCodesResponse>> RegenerateCodes([FromBody] TwoFactorRegenerateRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null || !user.Is2faEnabled) return BadRequest();

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            return BadRequest();
        }

        var plainCodes = GenerateRecoveryCodes(10);
        var hashedCodes = plainCodes.Select(c => BCrypt.Net.BCrypt.HashPassword(c)).ToList();
        user.RecoveryCodesJson = JsonSerializer.Serialize(hashedCodes, JsonOptions);
        await _db.SaveChangesAsync();

        await LogAuditEvent(user.Id, user.Email, "2fa_codes_regenerated");
        return Ok(new RecoveryCodesResponse(plainCodes));
    }

    [HttpGet("audit-log")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IEnumerable<object>>> GetAuditLog([FromQuery] int limit = 100)
    {
        var logs = await _db.AuditLogs
            .OrderByDescending(a => a.Timestamp)
            .Take(Math.Min(limit, 500))
            .Select(a => new
            {
                a.Id,
                a.UserId,
                a.UserEmail,
                a.Action,
                a.Details,
                a.IpAddress,
                a.Timestamp
            })
            .ToListAsync();
        return Ok(logs);
    }

    [HttpPost("refresh")]
    [Authorize]
    public async Task<ActionResult<object>> RefreshToken()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        // Check if session has been revoked
        var sessionId = User.FindFirstValue("sid");
        if (!string.IsNullOrEmpty(sessionId))
        {
            var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionId);
            if (session is null || session.IsRevoked) return Unauthorized();
            session.LastActiveAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null || !user.IsActive) return Unauthorized();

        var token = CreateToken(user, sessionId);
        var dto = ToDto(user);
        return Ok(new { token, user = dto, passwordExpired = IsPasswordExpired(user) });
    }

    [HttpGet("profile")]
    [Authorize]
    public async Task<ActionResult<UserDto>> Profile()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(ToDto(user));
    }

    [HttpPut("profile")]
    [Authorize]
    public async Task<ActionResult<UserDto>> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null)
        {
            return Unauthorized();
        }

        user.FullName = request.FullName;
        user.Office = request.Office;
        user.IsFirstLogin = false;

        await _db.SaveChangesAsync();
        return Ok(ToDto(user));
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null) return Unauthorized();

        if (!BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash))
        {
            return BadRequest(new { message = "Current password is incorrect." });
        }

        var validationError = ValidatePasswordStrength(request.NewPassword);
        if (validationError is not null)
        {
            return BadRequest(new { message = validationError });
        }

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.PasswordChangedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await LogAuditEvent(user.Id, user.Email, "password_changed");
        return NoContent();
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower());
        if (user is null)
        {
            return NoContent();
        }

        var token = GenerateToken();
        user.ResetToken = token;
        user.ResetTokenExpiresUtc = DateTime.UtcNow.AddHours(24);
        await _db.SaveChangesAsync();

        var emailSettings = await _notificationSettings.GetEmailSettingsAsync();
        var baseUrl = ResolveFrontendBaseUrl(emailSettings.FrontendBaseUrl);
        var link = $"{baseUrl}/reset-password?token={Uri.EscapeDataString(token)}";
        await _emailSender.SendPasswordResetAsync(user.Email, link);
        return NoContent();
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.ResetToken == request.Token);
        if (user is null || !user.ResetTokenExpiresUtc.HasValue || user.ResetTokenExpiresUtc < DateTime.UtcNow)
        {
            return BadRequest();
        }

        var validationError = ValidatePasswordStrength(request.NewPassword);
        if (validationError is not null)
        {
            return BadRequest(new { message = validationError });
        }

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.PasswordChangedAt = DateTime.UtcNow;
        user.IsFirstLogin = false;
        user.IsActive = true;
        user.ResetToken = null;
        user.ResetTokenExpiresUtc = null;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    // ── Login rate limiting helpers ─────────────────────────────────────

    private static bool IsLoginLockedOut(string emailKey)
    {
        if (!_loginAttempts.TryGetValue(emailKey, out var entry)) return false;
        if (DateTime.UtcNow - entry.FirstAttempt > LockoutDuration)
        {
            _loginAttempts.TryRemove(emailKey, out _);
            return false;
        }
        return entry.Count >= MaxLoginAttempts;
    }

    private void RecordLoginFailure(string emailKey, string email)
    {
        var newEntry = _loginAttempts.AddOrUpdate(
            emailKey,
            _ => (1, DateTime.UtcNow),
            (_, existing) =>
            {
                if (DateTime.UtcNow - existing.FirstAttempt > LockoutDuration)
                    return (1, DateTime.UtcNow);
                return (existing.Count + 1, existing.FirstAttempt);
            });

        // Send lockout notification email when threshold is reached
        if (newEntry.Count == MaxLoginAttempts)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    await _emailSender.SendNotificationAsync(
                        email,
                        "Commtrac account locked",
                        $"Your account has been temporarily locked due to {MaxLoginAttempts} failed login attempts. " +
                        $"It will unlock automatically in {LockoutDuration.TotalMinutes} minutes. " +
                        "If this wasn't you, please contact your administrator."
                    );
                }
                catch { /* best-effort */ }
            });
        }
    }

    private static void ClearLoginAttempts(string emailKey)
    {
        _loginAttempts.TryRemove(emailKey, out _);
    }

    // ── 2FA rate limiting helpers ──────────────────────────────────────

    private static bool Is2faLockedOut(string userId)
    {
        if (!_2faAttempts.TryGetValue(userId, out var entry)) return false;

        // Reset if lockout window has passed
        if (DateTime.UtcNow - entry.FirstAttempt > LockoutDuration)
        {
            _2faAttempts.TryRemove(userId, out _);
            return false;
        }

        return entry.Count >= Max2faAttempts;
    }

    private static void Record2faFailure(string userId)
    {
        _2faAttempts.AddOrUpdate(
            userId,
            _ => (1, DateTime.UtcNow),
            (_, existing) =>
            {
                // Reset window if expired
                if (DateTime.UtcNow - existing.FirstAttempt > LockoutDuration)
                    return (1, DateTime.UtcNow);
                return (existing.Count + 1, existing.FirstAttempt);
            });
    }

    private static void Clear2faAttempts(string userId)
    {
        _2faAttempts.TryRemove(userId, out _);
    }

    // ── Session management ──────────────────────────────────────────

    [HttpGet("sessions")]
    [Authorize]
    public async Task<ActionResult<IEnumerable<SessionDto>>> GetSessions()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var currentSessionId = User.FindFirstValue("sid");

        var sessions = await _db.Sessions
            .Where(s => s.UserId == userId && !s.IsRevoked)
            .OrderByDescending(s => s.LastActiveAt)
            .Take(20)
            .Select(s => new SessionDto(
                s.Id,
                s.IpAddress ?? "Unknown",
                s.UserAgent ?? "Unknown",
                s.CreatedAt,
                s.LastActiveAt,
                s.Id == currentSessionId
            ))
            .ToListAsync();

        return Ok(sessions);
    }

    [HttpDelete("sessions/{id}")]
    [Authorize]
    public async Task<IActionResult> RevokeSession(string id)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
        if (session is null) return NotFound();

        session.IsRevoked = true;
        await _db.SaveChangesAsync();

        await LogAuditEvent(userId, User.FindFirstValue(ClaimTypes.Email) ?? "", "session_revoked", $"Session {id}");
        return NoContent();
    }

    [HttpPost("sessions/revoke-all")]
    [Authorize]
    public async Task<IActionResult> RevokeAllSessions()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var currentSessionId = User.FindFirstValue("sid");
        var sessions = await _db.Sessions
            .Where(s => s.UserId == userId && !s.IsRevoked && s.Id != currentSessionId)
            .ToListAsync();

        foreach (var s in sessions)
        {
            s.IsRevoked = true;
        }
        await _db.SaveChangesAsync();

        await LogAuditEvent(userId, User.FindFirstValue(ClaimTypes.Email) ?? "", "sessions_revoked_all", $"{sessions.Count} sessions revoked");
        return NoContent();
    }

    // ── Login history ─────────────────────────────────────────────────

    [HttpGet("login-history")]
    [Authorize]
    public async Task<ActionResult<IEnumerable<object>>> GetLoginHistory([FromQuery] int limit = 20)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var history = await _db.AuditLogs
            .Where(a => a.UserId == userId && (
                a.Action == "login_success" ||
                a.Action == "login_failed" ||
                a.Action == "2fa_login_success" ||
                a.Action == "2fa_login_failed" ||
                a.Action == "2fa_recovery_used" ||
                a.Action == "password_changed" ||
                a.Action == "session_revoked"
            ))
            .OrderByDescending(a => a.Timestamp)
            .Take(Math.Min(limit, 50))
            .Select(a => new
            {
                a.Action,
                a.Details,
                a.IpAddress,
                a.Timestamp
            })
            .ToListAsync();

        return Ok(history);
    }

    // ── Trusted device token helpers ──────────────────────────────────

    private string CreateTrustedDeviceToken(string userId)
    {
        var key = _config["Jwt:Key"] ?? "dev-only-change-me";
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId),
            new Claim("purpose", "trusted-device")
        };

        var keyBytes = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var creds = new SigningCredentials(keyBytes, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: "commtrac-device",
            audience: "commtrac-device",
            claims: claims,
            expires: DateTime.UtcNow.AddDays(30),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private bool ValidateTrustedDeviceToken(string token, string expectedUserId)
    {
        try
        {
            var key = _config["Jwt:Key"] ?? "dev-only-change-me";
            var keyBytes = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
            var handler = new JwtSecurityTokenHandler();
            var principal = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = "commtrac-device",
                ValidateAudience = true,
                ValidAudience = "commtrac-device",
                ValidateLifetime = true,
                IssuerSigningKey = keyBytes
            }, out _);

            var purpose = principal.FindFirstValue("purpose");
            if (purpose != "trusted-device") return false;

            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier);
            return userId == expectedUserId;
        }
        catch
        {
            return false;
        }
    }

    // ── Token & helper methods ─────────────────────────────────────────

    private string CreateToken(UserEntity user, string? sessionId = null)
    {
        var key = _config["Jwt:Key"] ?? "dev-only-change-me";
        var issuer = _config["Jwt:Issuer"] ?? "commtrac";
        var audience = _config["Jwt:Audience"] ?? "commtrac-ui";
        var expiresMinutes = int.TryParse(_config["Jwt:ExpiresMinutes"], out var minutes) ? minutes : 720;

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.FullName),
            new(ClaimTypes.Role, user.Role),
            new("office", user.Office)
        };

        if (!string.IsNullOrEmpty(sessionId))
        {
            claims.Add(new Claim("sid", sessionId));
        }

        var keyBytes = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var creds = new SigningCredentials(keyBytes, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer,
            audience,
            claims,
            expires: DateTime.UtcNow.AddMinutes(expiresMinutes),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>Creates a short-lived JWT (5 min) for the 2FA verification step. Not usable for API access.</summary>
    private string Create2faToken(string userId)
    {
        var key = _config["Jwt:Key"] ?? "dev-only-change-me";
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId),
            new Claim("purpose", "2fa-pending")
        };

        var keyBytes = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var creds = new SigningCredentials(keyBytes, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: "commtrac-2fa",
            audience: "commtrac-2fa",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>Validates a 2FA pending token and returns the userId, or null if invalid.</summary>
    private string? Validate2faToken(string token)
    {
        try
        {
            var key = _config["Jwt:Key"] ?? "dev-only-change-me";
            var keyBytes = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
            var handler = new JwtSecurityTokenHandler();
            var principal = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = "commtrac-2fa",
                ValidateAudience = true,
                ValidAudience = "commtrac-2fa",
                ValidateLifetime = true,
                IssuerSigningKey = keyBytes
            }, out _);

            var purpose = principal.FindFirstValue("purpose");
            if (purpose != "2fa-pending") return null;

            return principal.FindFirstValue(ClaimTypes.NameIdentifier);
        }
        catch
        {
            return null;
        }
    }

    private static List<string> GenerateRecoveryCodes(int count)
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I for readability
        var codes = new List<string>(count);
        for (var i = 0; i < count; i++)
        {
            var bytes = RandomNumberGenerator.GetBytes(8);
            var code = new char[8];
            for (var j = 0; j < 8; j++)
            {
                code[j] = chars[bytes[j] % chars.Length];
            }
            codes.Add(new string(code));
        }
        return codes;
    }

    private static string? ValidatePasswordStrength(string password)
    {
        if (string.IsNullOrWhiteSpace(password)) return "Password is required.";
        if (password.Length < 8) return "Password must be at least 8 characters.";
        if (!password.Any(char.IsUpper)) return "Password must contain at least one uppercase letter.";
        if (!password.Any(char.IsLower)) return "Password must contain at least one lowercase letter.";
        if (!password.Any(char.IsDigit)) return "Password must contain at least one number.";
        if (!password.Any(c => !char.IsLetterOrDigit(c))) return "Password must contain at least one special character.";
        return null;
    }

    private static string GenerateToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes);
    }

    // ── Session helpers ─────────────────────────────────────────────────

    private async Task<SessionEntity> CreateSession(UserEntity user)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        var ua = Request.Headers.UserAgent.ToString();
        if (ua.Length > 500) ua = ua[..500];

        var session = new SessionEntity
        {
            UserId = user.Id,
            UserEmail = user.Email,
            IpAddress = ip,
            UserAgent = ua
        };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();
        return session;
    }

    private static bool IsPasswordExpired(UserEntity user)
    {
        if (user.PasswordChangedAt is null) return false; // never changed — no expiry enforced yet
        return (DateTime.UtcNow - user.PasswordChangedAt.Value).TotalDays > PasswordExpiryDays;
    }

    // ── Audit logging ──────────────────────────────────────────────────

    private async Task LogAuditEvent(string userId, string userEmail, string action, string? details = null)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        _db.AuditLogs.Add(new AuditLogEntity
        {
            UserId = userId,
            UserEmail = userEmail,
            Action = action,
            Details = details,
            IpAddress = ip
        });
        await _db.SaveChangesAsync();
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

    private static UserDto ToDto(UserEntity user)
    {
        var codesRemaining = 0;
        if (!string.IsNullOrEmpty(user.RecoveryCodesJson))
        {
            try { codesRemaining = JsonSerializer.Deserialize<List<string>>(user.RecoveryCodesJson, JsonOptions)?.Count ?? 0; } catch { }
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
            codesRemaining,
            IsPasswordExpired(user)
        );
    }
}
