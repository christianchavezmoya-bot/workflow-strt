using System.Net;
using System.Net.Mail;

namespace Commtrac.Api.Services;

public sealed class EmailSettings
{
    public string SmtpHost { get; set; } = "";
    public int SmtpPort { get; set; } = 25;
    public bool UseSsl { get; set; } = false;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public string FromAddress { get; set; } = "no-reply@commtrac.local";
    public string FrontendBaseUrl { get; set; } = "http://localhost:5173";
}

public interface IEmailSender
{
    Task SendInviteAsync(string toEmail, string inviteLink);
    Task SendPasswordResetAsync(string toEmail, string resetLink);
    Task SendNotificationAsync(string toEmail, string subject, string body);
    Task SendSignatureLinkAsync(string toEmail, string recipientName, string signLink, string assetName, DateTime expiresAtUtc, string? customMessage = null);
}


public sealed class EmailSender : IEmailSender
{
    private readonly NotificationSettingsService _settingsService;
    private readonly ILogger<EmailSender> _logger;

    public EmailSender(NotificationSettingsService settingsService, ILogger<EmailSender> logger)
    {
        _settingsService = settingsService;
        _logger = logger;
    }

    public Task SendInviteAsync(string toEmail, string inviteLink)
        => SendAsync(toEmail, "Commtrac invitation", $"You have been invited. Set your password: {inviteLink}");

    public Task SendPasswordResetAsync(string toEmail, string resetLink)
        => SendAsync(toEmail, "Commtrac password reset", $"Reset your password: {resetLink}");

    public Task SendNotificationAsync(string toEmail, string subject, string body)
        => SendAsync(toEmail, subject, body);

    public Task SendSignatureLinkAsync(string toEmail, string recipientName, string signLink, string assetName, DateTime expiresAtUtc, string? customMessage = null)
    {
        var name = string.IsNullOrWhiteSpace(recipientName) ? "Customer" : recipientName;
        var expires = expiresAtUtc.ToString("dddd, MMMM d yyyy 'at' h:mm tt 'UTC'");
        var defaultMsg = $"We are pleased to inform you that the installation work for the following asset has been completed: {assetName}.\n\n" +
                         $"Please use the link below to review the completed workflow documentation and provide your sign-off:";
        var invitation = string.IsNullOrWhiteSpace(customMessage) ? defaultMsg : customMessage.Trim();
        var body =
            $"Hello {name},\n\n" +
            $"{invitation}\n\n" +
            $"{signLink}\n\n" +
            $"This link will expire on {expires}.\n\n" +
            $"If you did not expect this email, please disregard it.\n\n" +
            $"— Commtrac";
        return SendAsync(toEmail, $"Signature Required — {assetName}", body);
    }

    private async Task SendAsync(string toEmail, string subject, string body)
    {
        var settings = await _settingsService.GetEmailSettingsAsync();

        if (string.IsNullOrWhiteSpace(settings.SmtpHost))
        {
            _logger.LogError("Email send failed because SMTP is not configured. To: {To} Subject: {Subject}", toEmail, subject);
            throw new InvalidOperationException("SMTP is not configured. Set Notification Settings SMTP Host before sending invitation emails.");
        }

        using var client = new SmtpClient(settings.SmtpHost, settings.SmtpPort)
        {
            EnableSsl = settings.UseSsl
        };

        if (!string.IsNullOrWhiteSpace(settings.Username))
        {
            client.Credentials = new NetworkCredential(settings.Username, settings.Password);
        }

        var from = string.IsNullOrWhiteSpace(settings.FromAddress) ? "no-reply@commtrac.local" : settings.FromAddress;
        var mail = new MailMessage(from, toEmail, subject, body);
        await client.SendMailAsync(mail);
    }
}
