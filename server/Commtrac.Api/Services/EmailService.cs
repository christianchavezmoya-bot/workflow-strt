using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;

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
}

public sealed class EmailSender : IEmailSender
{
    private readonly EmailSettings _settings;
    private readonly ILogger<EmailSender> _logger;

    public EmailSender(IOptions<EmailSettings> options, ILogger<EmailSender> logger)
    {
        _settings = options.Value;
        _logger = logger;
    }

    public Task SendInviteAsync(string toEmail, string inviteLink)
        => SendAsync(toEmail, "Commtrac invitation", $"You have been invited. Set your password: {inviteLink}");

    public Task SendPasswordResetAsync(string toEmail, string resetLink)
        => SendAsync(toEmail, "Commtrac password reset", $"Reset your password: {resetLink}");

    public Task SendNotificationAsync(string toEmail, string subject, string body)
        => SendAsync(toEmail, subject, body);

    private Task SendAsync(string toEmail, string subject, string body)
    {
        if (string.IsNullOrWhiteSpace(_settings.SmtpHost))
        {
            _logger.LogInformation("Email (simulated). To: {To} Subject: {Subject} Body: {Body}", toEmail, subject, body);
            return Task.CompletedTask;
        }

        using var client = new SmtpClient(_settings.SmtpHost, _settings.SmtpPort)
        {
            EnableSsl = _settings.UseSsl
        };

        if (!string.IsNullOrWhiteSpace(_settings.Username))
        {
            client.Credentials = new NetworkCredential(_settings.Username, _settings.Password);
        }

        var mail = new MailMessage(_settings.FromAddress, toEmail, subject, body);
        client.Send(mail);
        return Task.CompletedTask;
    }
}
