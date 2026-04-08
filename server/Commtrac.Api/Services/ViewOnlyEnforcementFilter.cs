using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Commtrac.Api.Services;

public sealed class ViewOnlyEnforcementFilter : IAsyncActionFilter
{
    private static readonly HashSet<string> SafeMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        "GET",
        "HEAD",
        "OPTIONS"
    };

    private readonly IViewOnlyContextService _viewOnlyContext;

    public ViewOnlyEnforcementFilter(IViewOnlyContextService viewOnlyContext)
    {
        _viewOnlyContext = viewOnlyContext;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var httpContext = context.HttpContext;
        if (!httpContext.User.Identity?.IsAuthenticated ?? true)
        {
            await next();
            return;
        }

        if (SafeMethods.Contains(httpContext.Request.Method))
        {
            await next();
            return;
        }

        var path = httpContext.Request.Path.Value ?? string.Empty;
        if (path.StartsWith("/api/auth/refresh", StringComparison.OrdinalIgnoreCase))
        {
            await next();
            return;
        }

        if (_viewOnlyContext.IsViewOnly())
        {
            context.Result = new ObjectResult(new
            {
                message = "View-only mode is active. This action is disabled."
            })
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
            return;
        }

        await next();
    }
}
