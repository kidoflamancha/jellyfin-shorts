using System;
using System.IO;
using System.Reflection;
using System.Security.Claims;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.Shorts.Configuration;
using Jellyfin.Plugin.Shorts.Services;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Shorts.Controllers;

[ApiController]
[Route("Shorts")]
public class ShortsController : ControllerBase
{
    private readonly ShortsFeedService _feedService;
    private readonly IUserManager _userManager;
    private readonly ILogger<ShortsController> _logger;

    public ShortsController(
        ShortsFeedService feedService,
        IUserManager userManager,
        ILogger<ShortsController> logger)
    {
        _feedService = feedService;
        _userManager = userManager;
        _logger = logger;
    }

    /// <summary>
    /// Ping endpoint to verify plugin availability.
    /// </summary>
    [HttpGet("Ping")]
    [AllowAnonymous]
    public IActionResult Ping()
    {
        return Ok(new
        {
            Name = "Jellyfin Shorts",
            Status = "Running",
            Version = typeof(ShortsController).Assembly.GetName().Version?.ToString() ?? "1.0.0.0"
        });
    }

    /// <summary>
    /// Feed endpoint returning videos for shorts playback.
    /// </summary>
    [HttpGet("Feed")]
    [AllowAnonymous] // Allow flexible auth check inside method
    public IActionResult GetFeed(
        [FromQuery] Guid? folderId,
        [FromQuery] Guid? userId,
        [FromQuery] bool? recursive,
        [FromQuery] int? limit,
        [FromQuery] int? startIndex,
        [FromQuery] bool? random,
        [FromQuery] int? maxDurationMinutes)
    {
        User? user = GetCurrentUser(userId);

        var result = _feedService.GetFeed(
            user,
            folderId,
            recursive,
            limit,
            startIndex,
            random,
            maxDurationMinutes);

        return Ok(result);
    }

    /// <summary>
    /// Serves the standalone Shorts Web App.
    /// </summary>
    [HttpGet("app")]
    [AllowAnonymous]
    public IActionResult GetApp()
    {
        return GetEmbeddedFile("shorts.html", "text/html; charset=utf-8");
    }

    /// <summary>
    /// Serves embedded static resources for Web and injection.
    /// </summary>
    [HttpGet("web/{*filename}")]
    [AllowAnonymous]
    public IActionResult GetWebAsset([FromRoute] string filename)
    {
        if (string.IsNullOrWhiteSpace(filename) || filename.Contains(".."))
        {
            return NotFound();
        }

        string cleanName = filename.TrimStart('/');
        string contentType = cleanName switch
        {
            var s when s.EndsWith(".html", StringComparison.OrdinalIgnoreCase) => "text/html; charset=utf-8",
            var s when s.EndsWith(".js", StringComparison.OrdinalIgnoreCase) => "application/javascript; charset=utf-8",
            var s when s.EndsWith(".css", StringComparison.OrdinalIgnoreCase) => "text/css; charset=utf-8",
            var s when s.EndsWith(".svg", StringComparison.OrdinalIgnoreCase) => "image/svg+xml",
            var s when s.EndsWith(".png", StringComparison.OrdinalIgnoreCase) => "image/png",
            var s when s.EndsWith(".json", StringComparison.OrdinalIgnoreCase) => "application/json",
            _ => "application/octet-stream"
        };

        return GetEmbeddedFile(cleanName, contentType);
    }

    /// <summary>
    /// Retrieves current plugin configuration.
    /// </summary>
    [HttpGet("Configuration")]
    public ActionResult<ShortsConfiguration> GetConfiguration()
    {
        return Ok(Plugin.Instance?.Configuration ?? new ShortsConfiguration());
    }

    /// <summary>
    /// Updates plugin configuration.
    /// </summary>
    [HttpPost("Configuration")]
    public IActionResult UpdateConfiguration([FromBody] ShortsConfiguration newConfig)
    {
        if (Plugin.Instance == null)
        {
            return StatusCode(StatusCodes.Status500InternalServerError, "Plugin instance not found.");
        }

        var config = Plugin.Instance.Configuration;
        config.Recursive = newConfig.Recursive;
        config.DefaultLimit = newConfig.DefaultLimit;
        config.MaxDurationMinutes = newConfig.MaxDurationMinutes;
        config.EnableRandomFeedByDefault = newConfig.EnableRandomFeedByDefault;
        config.AutoAdvance = newConfig.AutoAdvance;

        Plugin.Instance.SaveConfiguration();
        return Ok(config);
    }

    private User? GetCurrentUser(Guid? requestedUserId)
    {
        if (requestedUserId.HasValue && requestedUserId.Value != Guid.Empty)
        {
            var user = _userManager.GetUserById(requestedUserId.Value);
            if (user != null)
            {
                return user;
            }
        }

        // Try to get from ClaimsPrincipal
        var claimValue = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("UserId")?.Value;

        if (!string.IsNullOrEmpty(claimValue) && Guid.TryParse(claimValue, out var claimGuid))
        {
            return _userManager.GetUserById(claimGuid);
        }

        return null;
    }

    private IActionResult GetEmbeddedFile(string resourceFileName, string contentType)
    {
        var assembly = Assembly.GetExecutingAssembly();
        string resourceName = $"Jellyfin.Plugin.Shorts.Web.{resourceFileName.Replace('/', '.')}";

        var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream == null)
        {
            _logger.LogWarning("Embedded resource not found: {ResourceName}", resourceName);
            return NotFound($"Resource {resourceFileName} not found.");
        }

        Response.Headers.CacheControl = "no-store, no-cache, must-revalidate, max-age=0";
        Response.Headers.Pragma = "no-cache";
        Response.Headers.Expires = "0";
        return File(stream, contentType);
    }
}
