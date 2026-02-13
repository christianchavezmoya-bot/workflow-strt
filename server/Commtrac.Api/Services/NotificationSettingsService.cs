using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;

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
        entity.FrontendBaseUrl = (dto.FrontendBaseUrl?.Trim().TrimEnd('/')) ?? "http://localhost:5173";
        entity.SmsProvider = dto.SmsProvider?.Trim() ?? "";
        entity.SmsApiKey = dto.SmsApiKey ?? "";
        entity.SmsSender = dto.SmsSender?.Trim() ?? "";

        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<EmailSettings> GetEmailSettingsAsync()
    {
        var s = await GetAsync();
        return new EmailSettings
        {
            SmtpHost = s.SmtpHost ?? "",
            SmtpPort = s.SmtpPort <= 0 ? 25 : s.SmtpPort,
            UseSsl = s.SmtpUseSsl,
            Username = s.SmtpUser ?? "",
            Password = s.SmtpPass ?? "",
            FromAddress = string.IsNullOrWhiteSpace(s.SmtpFrom) ? "no-reply@commtrac.local" : s.SmtpFrom,
            FrontendBaseUrl = string.IsNullOrWhiteSpace(s.FrontendBaseUrl) ? "http://localhost:5173" : s.FrontendBaseUrl.TrimEnd('/')
        };
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
}
