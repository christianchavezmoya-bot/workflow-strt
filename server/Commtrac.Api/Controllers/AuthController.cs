using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using BCrypt.Net;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly IEmailSender _emailSender;
    private readonly EmailSettings _emailSettings;

    public AuthController(AppDbContext db, IConfiguration config, IEmailSender emailSender, Microsoft.Extensions.Options.IOptions<EmailSettings> emailSettings)
    {
        _db = db;
        _config = config;
        _emailSender = emailSender;
        _emailSettings = emailSettings.Value;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower());
        if (user is null || !user.IsActive)
        {
            return Unauthorized();
        }

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            return Unauthorized();
        }

        var token = CreateToken(user);
        var dto = ToDto(user);
        return Ok(new LoginResponse(token, dto, user.IsFirstLogin));
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

        var link = $"{_emailSettings.FrontendBaseUrl}/reset-password?token={Uri.EscapeDataString(token)}";
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

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.IsFirstLogin = false;
        user.IsActive = true;
        user.ResetToken = null;
        user.ResetTokenExpiresUtc = null;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    private string CreateToken(UserEntity user)
    {
        var key = _config["Jwt:Key"] ?? "dev-only-change-me";
        var issuer = _config["Jwt:Issuer"] ?? "commtrac";
        var audience = _config["Jwt:Audience"] ?? "commtrac-ui";
        var expiresMinutes = int.TryParse(_config["Jwt:ExpiresMinutes"], out var minutes) ? minutes : 720;

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("office", user.Office)
        };

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

    private static string GenerateToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes);
    }

    private static UserDto ToDto(UserEntity user)
        => new(
            user.Id,
            user.Email,
            user.FullName,
            user.Role,
            user.Office,
            user.IsActive,
            user.IsFirstLogin
        );
}
