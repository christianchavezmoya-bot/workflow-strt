using Commtrac.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/health")]
[AllowAnonymous]
public class HealthController : ControllerBase
{
    private readonly AppDbContext _db;

    public HealthController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        try
        {
            var canConnect = await _db.Database.CanConnectAsync(cancellationToken);
            if (!canConnect)
            {
                return StatusCode(503, new { status = "unhealthy", database = "disconnected" });
            }

            return Ok(new { status = "healthy", database = "connected" });
        }
        catch
        {
            return StatusCode(503, new { status = "unhealthy", database = "error" });
        }
    }
}
