using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly IHostApplicationLifetime _lifetime;

    public AdminController(IHostApplicationLifetime lifetime)
    {
        _lifetime = lifetime;
    }

    [HttpPost("shutdown")]
    public IActionResult Shutdown()
    {
        _ = Task.Run(() =>
        {
            Thread.Sleep(300);
            _lifetime.StopApplication();
        });

        return Ok(new { status = "stopping" });
    }
}
