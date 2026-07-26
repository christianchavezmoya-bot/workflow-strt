using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.Net;

namespace Commtrac.Api.Services;

public sealed class NotificationSettingsService
{
    private readonly AppDbContext _db;
    private readonly EmailSettings _fallbackEmail;
    private readonly SmsSettings _fallbackSms;

    public NotificationSettingsService(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _fallbackEmail = config.GetSection("Email").Get<EmailSettings>() ?? new EmailSettings();
        _fallbackSms = config.GetSection("Sms").Get<SmsSettings>() ?? new SmsSettings();
    }

    public async Task<NotificationSettingsDto> GetAsync()
    {
        var entity = await _db.NotificationSettings.AsNoTracking().FirstOrDefaultAsync(s => s.Id == 1);
        if (entity is null)
        {
            // Fall back to appsettings/env vars when DB isn't initialized.
            return new NotificationSettingsDto(
                _fallbackEmail.SmtpHost,
                _fallbackEmail.SmtpPort,
                _fallbackEmail.UseSsl,
                _fallbackEmail.Username,
                _fallbackEmail.Password,
                _fallbackEmail.FromAddress,
                _fallbackEmail.FrontendBaseUrl,
                _fallbackSms.Provider,
                _fallbackSms.ApiKey,
                _fallbackSms.Sender
            );
        }

        return ToDto(entity);
    }

    public async Task<NotificationSettingsDto> SaveAsync(NotificationSettingsDto dto)
    {
        var entity = await _db.NotificationSettings.FirstOrDefaultAsync(s => s.Id == 1);
        if (entity is null)
        {
            entity = new Models.NotificationSettingsEntity { Id = 1 };
            _db.NotificationSettings.Add(entity);
        }

        entity.SmtpHost = dto.SmtpHost?.Trim() ?? "";
        entity.SmtpPort = dto.SmtpPort <= 0 ? 25 : dto.SmtpPort;
        entity.SmtpUseSsl = dto.SmtpUseSsl;
        entity.SmtpUser = dto.SmtpUser?.Trim() ?? "";
        entity.SmtpPass = dto.SmtpPass ?? "";
        entity.SmtpFrom = dto.SmtpFrom?.Trim() ?? "";
        entity.FrontendBaseUrl = (dto.FrontendBaseUrl?.Trim().TrimEnd('/')) ?? "";
        entity.SmsProvider = dto.SmsProvider?.Trim() ?? "";
        entity.SmsApiKey = dto.SmsApiKey ?? "";
        entity.SmsSender = dto.SmsSender?.Trim() ?? "";

        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<EmailSettings> GetEmailSettingsAsync()
    {
        var s = await GetAsync();
        var effectiveFrontendBaseUrl = ResolveFrontendBaseUrl(s.FrontendBaseUrl);

        return new EmailSettings
        {
            SmtpHost = s.SmtpHost ?? "",
            SmtpPort = s.SmtpPort <= 0 ? 25 : s.SmtpPort,
            UseSsl = s.SmtpUseSsl,
            Username = s.SmtpUser ?? "",
            Password = s.SmtpPass ?? "",
            FromAddress = string.IsNullOrWhiteSpace(s.SmtpFrom) ? AppBranding.EmailFromAddress : s.SmtpFrom,
            FromName = string.IsNullOrWhiteSpace(_fallbackEmail.FromName) ? AppBranding.EmailFromName : _fallbackEmail.FromName,
            FrontendBaseUrl = effectiveFrontendBaseUrl
        };
    }

    public async Task<string> GetFrontendBaseUrlAsync()
    {
        var settings = await GetAsync();
        return ResolveFrontendBaseUrl(settings.FrontendBaseUrl);
    }

    public async Task<SmsSettings> GetSmsSettingsAsync()
    {
        var s = await GetAsync();
        return new SmsSettings
        {
            Provider = s.SmsProvider ?? "",
            ApiKey = s.SmsApiKey ?? "",
            Sender = s.SmsSender ?? ""
        };
    }

    private static NotificationSettingsDto ToDto(Models.NotificationSettingsEntity entity)
        => new(
            entity.SmtpHost,
            entity.SmtpPort,
            entity.SmtpUseSsl,
            entity.SmtpUser,
            entity.SmtpPass,
            entity.SmtpFrom,
            entity.FrontendBaseUrl,
            entity.SmsProvider,
            entity.SmsApiKey,
            entity.SmsSender
        );

    private static bool IsLocalhostUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return false;
        }

        var host = uri.Host.ToLowerInvariant();
        return host == "localhost" || host == "127.0.0.1" || host == "::1";
    }

    private static bool IsPrivateIpv4Url(string url)
    {
        return Uri.TryCreate(url, UriKind.Absolute, out var uri) && IsPrivateIpv4Host(uri.Host);
    }

    private static bool IsPrivateIpv4Host(string host)
    {
        return IPAddress.TryParse(host, out var address) && IsPrivateIpv4Address(address);
    }

    private static bool IsPrivateIpv4Address(IPAddress address)
    {
        if (address.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork)
        {
            return false;
        }

        var bytes = address.GetAddressBytes();
        return bytes[0] == 10
            || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31)
            || (bytes[0] == 192 && bytes[1] == 168);
    }

    private string ResolveFrontendBaseUrl(string? configuredUrl)
    {
        var fallbackFrontendBaseUrl = (_fallbackEmail.FrontendBaseUrl ?? "").Trim().TrimEnd('/');
        var effectiveFrontendBaseUrl = (configuredUrl ?? "").Trim().TrimEnd('/');

        if (string.IsNullOrWhiteSpace(effectiveFrontendBaseUrl) || IsLocalhostUrl(effectiveFrontendBaseUrl))
        {
            if (!string.IsNullOrWhiteSpace(fallbackFrontendBaseUrl) && !IsLocalhostUrl(fallbackFrontendBaseUrl))
            {
                effectiveFrontendBaseUrl = fallbackFrontendBaseUrl;
            }
        }
        else if (!string.IsNullOrWhiteSpace(fallbackFrontendBaseUrl)
                 && IsPrivateIpv4Url(effectiveFrontendBaseUrl)
                 && IsPrivateIpv4Url(fallbackFrontendBaseUrl)
                 && !string.Equals(effectiveFrontendBaseUrl, fallbackFrontendBaseUrl, StringComparison.OrdinalIgnoreCase))
        {
            effectiveFrontendBaseUrl = fallbackFrontendBaseUrl;
        }

        return effectiveFrontendBaseUrl;
    }
}
