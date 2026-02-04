using BCrypt.Net;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Security.Cryptography;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize(Roles = "Admin")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IEmailSender _emailSender;
    private readonly EmailSettings _emailSettings;

    public UsersController(
        AppDbContext db,
        IEmailSender emailSender,
        IOptions<EmailSettings> emailSettings)
    {
        _db = db;
        _emailSender = emailSender;
        _emailSettings = emailSettings.Value;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserDto>>> GetAll()
    {
        var users = await _db.Users.OrderBy(u => u.FullName).ToListAsync();
        return Ok(users.Select(ToDto));
    }

    [HttpPost]
    public async Task<ActionResult<UserDto>> Create([FromBody] CreateUserRequest request)
    {
        var user = new UserEntity
        {
            Email = request.Email,
            FullName = request.FullName,
            Role = request.Role,
            Office = request.Office,
            IsActive = true,
            IsFirstLogin = true,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Temp123!")
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAll), new { id = user.Id }, ToDto(user));
    }

    [HttpPut("{id}")]
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
        if (!string.IsNullOrWhiteSpace(request.Office)) user.Office = request.Office;
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
    public async Task<ActionResult<UserDto>> Patch(string id, [FromBody] UpdateUserRequest request)
    {
        return await Update(id, request);
    }

    [HttpPost("{id}/invite")]
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

        var link = $"{_emailSettings.FrontendBaseUrl}/reset-password?token={Uri.EscapeDataString(token)}";
        await _emailSender.SendInviteAsync(user.Email, link);
        return NoContent();
    }

    [HttpDelete("{id}")]
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
        => new(
            user.Id,
            user.Email,
            user.FullName,
            user.Role,
            user.Office,
            user.IsActive,
            user.IsFirstLogin
        );

    private static string GenerateToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes);
    }
}
