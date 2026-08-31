using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/version")]
[AllowAnonymous]
public class VersionController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly IHostEnvironment _environment;

    public VersionController(IConfiguration config, IHostEnvironment environment)
    {
        _config = config;
        _environment = environment;
    }

    [HttpGet]
    public IActionResult Get()
    {
        var assembly = Assembly.GetExecutingAssembly().GetName();
        var informational = assembly.Version?.ToString() ?? "0.0.0";
        var gitSha =
            _config["Build:GitSha"]
            ?? Environment.GetEnvironmentVariable("GIT_SHA")
            ?? Environment.GetEnvironmentVariable("BUILD_SHA")
            ?? "unknown";
        var builtAt =
            _config["Build:BuiltAt"]
            ?? Environment.GetEnvironmentVariable("BUILD_TIME")
            ?? "";

        return Ok(new
        {
            application = "Commtrac.Api",
            version = informational,
            environment = _environment.EnvironmentName,
            gitSha,
            builtAt,
        });
    }
}
