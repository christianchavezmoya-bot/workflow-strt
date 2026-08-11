using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using Commtrac.Api.Data;
using Google.Apis.Auth.OAuth2;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Commtrac.Api.Services;

/// <summary>
/// Delivers mobile push notifications to registered device tokens.
/// When FCM/APNs credentials are not configured, logs and no-ops safely.
/// </summary>
public sealed class PushNotificationDeliveryService
{
    private static readonly Uri FcmBaseUri = new("https://fcm.googleapis.com/");
    private static readonly Uri ApnsSandboxBaseUri = new("https://api.sandbox.push.apple.com/");
    private static readonly Uri ApnsProductionBaseUri = new("https://api.push.apple.com/");

    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<PushNotificationDeliveryService> _logger;
    private readonly PushSettings _settings;

    public PushNotificationDeliveryService(
        AppDbContext db,
        IHttpClientFactory httpClientFactory,
        IOptions<PushSettings> settings,
        ILogger<PushNotificationDeliveryService> logger)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _settings = settings.Value;
    }

    public async Task SendToUsersAsync(
        IEnumerable<string> userIds,
        string title,
        string body,
        CancellationToken cancellationToken = default)
    {
        var ids = userIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (ids.Count == 0) return;

        var tokens = await _db.PushDeviceTokens
            .AsNoTracking()
            .Where(t => ids.Contains(t.UserId))
            .Select(t => new { t.Token, t.Platform })
            .ToListAsync(cancellationToken);

        if (tokens.Count == 0) return;

        var distinctTargets = tokens
            .Where(t => !string.IsNullOrWhiteSpace(t.Token))
            .GroupBy(t => t.Token.Trim(), StringComparer.Ordinal)
            .Select(g => new PushTarget(g.Key, NormalizePlatform(g.Select(x => x.Platform).FirstOrDefault())))
            .ToList();

        var androidTargets = distinctTargets.Where(t => t.Platform == PushPlatform.Android).ToList();
        var iosTargets = distinctTargets.Where(t => t.Platform == PushPlatform.Ios).ToList();
        var unknownTargets = distinctTargets.Where(t => t.Platform == PushPlatform.Unknown).ToList();

        if (unknownTargets.Count > 0)
        {
            _logger.LogInformation(
                "Skipping {Count} push token(s) with unknown platform because backend delivery is platform-specific.",
                unknownTargets.Count);
        }

        if (androidTargets.Count > 0)
        {
            await SendAndroidBatchAsync(androidTargets, title, body, cancellationToken);
        }

        if (iosTargets.Count > 0)
        {
            await SendIosBatchAsync(iosTargets, title, body, cancellationToken);
        }
    }

    private async Task SendAndroidBatchAsync(
        IReadOnlyCollection<PushTarget> targets,
        string title,
        string body,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_settings.FirebaseProjectId) ||
            string.IsNullOrWhiteSpace(_settings.FirebaseServiceAccountJsonPath))
        {
            _logger.LogWarning(
                "Push/Firebase is not configured. Skipping {Count} Android push token(s).",
                targets.Count);
            return;
        }

        if (!File.Exists(_settings.FirebaseServiceAccountJsonPath))
        {
            _logger.LogWarning(
                "Push/Firebase service account file not found at {Path}. Skipping {Count} Android push token(s).",
                _settings.FirebaseServiceAccountJsonPath,
                targets.Count);
            return;
        }

        var credential = GoogleCredential
            .FromFile(_settings.FirebaseServiceAccountJsonPath)
            .CreateScoped("https://www.googleapis.com/auth/firebase.messaging");
        var accessToken = await credential.UnderlyingCredential.GetAccessTokenForRequestAsync();

        var client = _httpClientFactory.CreateClient();
        client.BaseAddress = FcmBaseUri;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        foreach (var target in targets)
        {
            var payload = new
            {
                message = new
                {
                    token = target.Token,
                    notification = new
                    {
                        title,
                        body,
                    },
                    android = new
                    {
                        priority = "HIGH",
                        restricted_package_name = string.IsNullOrWhiteSpace(_settings.AndroidPackage) ? null : _settings.AndroidPackage,
                    },
                },
                validate_only = false,
            };

            try
            {
                using var response = await client.PostAsJsonAsync(
                    $"v1/projects/{_settings.FirebaseProjectId}/messages:send",
                    payload,
                    cancellationToken);

                if (!response.IsSuccessStatusCode)
                {
                    var errorText = await response.Content.ReadAsStringAsync(cancellationToken);
                    _logger.LogWarning(
                        "FCM push failed for token prefix {Prefix} with status {StatusCode}: {Body}",
                        Prefix(target.Token),
                        (int)response.StatusCode,
                        errorText);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "FCM push threw for token prefix {Prefix}.",
                    Prefix(target.Token));
            }
        }
    }

    private async Task SendIosBatchAsync(
        IReadOnlyCollection<PushTarget> targets,
        string title,
        string body,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_settings.Apns.TeamId) ||
            string.IsNullOrWhiteSpace(_settings.Apns.KeyId) ||
            string.IsNullOrWhiteSpace(_settings.Apns.BundleId) ||
            string.IsNullOrWhiteSpace(_settings.Apns.AuthKeyPath))
        {
            _logger.LogWarning(
                "Push/APNs is not configured. Skipping {Count} iOS push token(s).",
                targets.Count);
            return;
        }

        if (!File.Exists(_settings.Apns.AuthKeyPath))
        {
            _logger.LogWarning(
                "Push/APNs auth key file not found at {Path}. Skipping {Count} iOS push token(s).",
                _settings.Apns.AuthKeyPath,
                targets.Count);
            return;
        }

        var authToken = await BuildApnsJwtAsync(_settings.Apns.AuthKeyPath, _settings.Apns.TeamId, _settings.Apns.KeyId, cancellationToken);
        var client = _httpClientFactory.CreateClient();
        client.BaseAddress = _settings.Apns.UseSandbox ? ApnsSandboxBaseUri : ApnsProductionBaseUri;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("bearer", authToken);
        client.DefaultRequestVersion = HttpVersion.Version20;
        client.DefaultVersionPolicy = HttpVersionPolicy.RequestVersionOrHigher;

        foreach (var target in targets)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"3/device/{target.Token}");
            request.Version = HttpVersion.Version20;
            request.VersionPolicy = HttpVersionPolicy.RequestVersionOrHigher;
            request.Headers.TryAddWithoutValidation("apns-topic", _settings.Apns.BundleId);
            request.Headers.TryAddWithoutValidation("apns-push-type", "alert");
            request.Headers.TryAddWithoutValidation("apns-priority", "10");
            request.Content = JsonContent.Create(new
            {
                aps = new
                {
                    alert = new
                    {
                        title,
                        body,
                    },
                    sound = "default",
                },
            });

            try
            {
                using var response = await client.SendAsync(request, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    var errorText = await response.Content.ReadAsStringAsync(cancellationToken);
                    _logger.LogWarning(
                        "APNs push failed for token prefix {Prefix} with status {StatusCode}: {Body}",
                        Prefix(target.Token),
                        (int)response.StatusCode,
                        errorText);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "APNs push threw for token prefix {Prefix}.",
                    Prefix(target.Token));
            }
        }
    }

    private static async Task<string> BuildApnsJwtAsync(
        string authKeyPath,
        string teamId,
        string keyId,
        CancellationToken cancellationToken)
    {
        var pem = await File.ReadAllTextAsync(authKeyPath, cancellationToken);
        using var ecdsa = ECDsa.Create();
        ecdsa.ImportFromPem(pem);

        var signingKey = new ECDsaSecurityKey(ecdsa) { KeyId = keyId };
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.EcdsaSha256);
        var now = DateTimeOffset.UtcNow;

        var header = new JwtHeader(credentials);
        var payload = new JwtPayload
        {
            { "iss", teamId },
            { "iat", now.ToUnixTimeSeconds() },
        };

        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(header, payload));
    }

    private static PushPlatform NormalizePlatform(string? platform)
    {
        var value = platform?.Trim().ToLowerInvariant();
        return value switch
        {
            "android" or "fcm" => PushPlatform.Android,
            "ios" or "iphone" or "ipad" or "apns" => PushPlatform.Ios,
            _ => PushPlatform.Unknown,
        };
    }

    private static string Prefix(string token)
    {
        return token.Length > 8 ? token[..8] : token;
    }

    private readonly record struct PushTarget(string Token, PushPlatform Platform);

    private enum PushPlatform
    {
        Unknown,
        Android,
        Ios,
    }
}

