using System.Net;
using System.Net.Mail;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Commtrac.Api.Services;

/// <summary>
/// Central outbound email service. Prefers Resend when an API key is configured,
/// falls back to SMTP, then simulates (log-only) so app flows never fail on email.
/// </summary>
public sealed class ResendEmailService : IEmailService, IEmailSender
{
    private const string ResendApiUrl = "https://api.resend.com/emails";
    private const int MaxAttempts = 3;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly NotificationSettingsService _settingsService;
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ResendEmailService> _logger;

    public ResendEmailService(
        NotificationSettingsService settingsService,
        IConfiguration config,
        IHttpClientFactory httpClientFactory,
        ILogger<ResendEmailService> logger)
    {
        _settingsService = settingsService;
        _config = config;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public Task SendTestEmailAsync(string toEmail, CancellationToken cancellationToken = default)
    {
        var body =
            $"This is a test email from {AppBranding.AppName}.\n\n" +
            "If you received this message, outbound email is configured correctly.\n\n" +
            $"— {AppBranding.AppName}";
        return SendAsync(toEmail, $"{AppBranding.AppName} test email", body, cancellationToken);
    }

    public Task SendInviteAsync(string toEmail, string inviteLink, CancellationToken cancellationToken = default)
    {
        var body =
            $"Hello,\n\n" +
            $"You have been invited to {AppBranding.AppName}. " +
            $"Use the link below to set your password and activate your account:\n\n" +
            $"{inviteLink}\n\n" +
            $"If you did not expect this invitation, you can ignore this email.\n\n" +
            $"— {AppBranding.AppName}";
        return SendAsync(toEmail, $"{AppBranding.AppName} invitation", body, cancellationToken);
    }

    public Task SendPasswordResetAsync(string toEmail, string resetLink, CancellationToken cancellationToken = default)
    {
        var body =
            $"Hello,\n\n" +
            $"We received a request to reset your {AppBranding.AppName} password. " +
            $"Use the link below to choose a new password:\n\n" +
            $"{resetLink}\n\n" +
            $"This link expires in 24 hours. If you did not request a reset, you can ignore this email.\n\n" +
            $"— {AppBranding.AppName}";
        return SendAsync(toEmail, $"{AppBranding.AppName} password reset", body, cancellationToken);
    }

    public Task SendNotificationAsync(string toEmail, string subject, string body, CancellationToken cancellationToken = default)
        => SendAsync(toEmail, subject, body, cancellationToken);

    public Task SendSignatureLinkAsync(
        string toEmail,
        string recipientName,
        string signLink,
        string assetName,
        DateTime expiresAtUtc,
        string? customMessage = null,
        CancellationToken cancellationToken = default)
    {
        var name = string.IsNullOrWhiteSpace(recipientName) ? "Customer" : recipientName.Trim();
        var expires = expiresAtUtc.ToString("dddd, MMMM d yyyy 'at' h:mm tt 'UTC'");
        var defaultMsg =
            $"We are pleased to inform you that the installation work for the following asset has been completed: {assetName}.\n\n" +
            "Please use the link below to review the completed workflow documentation and provide your sign-off:";
        var invitation = string.IsNullOrWhiteSpace(customMessage) ? defaultMsg : customMessage.Trim();
        var body =
            $"Hello {name},\n\n" +
            $"{invitation}\n\n" +
            $"{signLink}\n\n" +
            $"This link will expire on {expires}.\n\n" +
            "If you did not expect this email, please disregard it.\n\n" +
            $"— {AppBranding.AppName}";
        return SendAsync(toEmail, $"Signature Required — {assetName}", body, cancellationToken);
    }

    public Task SendWorkflowCompletionNotificationAsync(
        string toEmail,
        string assetTag,
        string jobLabel,
        string completedByName,
        string? reportOrSignLink = null,
        CancellationToken cancellationToken = default)
    {
        var linkLine = string.IsNullOrWhiteSpace(reportOrSignLink)
            ? ""
            : $"\nOpen in {AppBranding.AppName}:\n{reportOrSignLink}\n";
        var body =
            $"Hello,\n\n" +
            $"{completedByName} completed a field workflow in {AppBranding.AppName}.\n\n" +
            $"Asset: {assetTag}\n" +
            $"Job: {jobLabel}\n" +
            linkLine +
            "\n" +
            $"— {AppBranding.AppName}";
        return SendAsync(
            toEmail,
            $"Workflow completed — {assetTag} ({jobLabel})",
            body,
            cancellationToken);
    }

    public Task<AssetReportEmailDeliveryResult> SendAssetReportShareAsync(
        string toEmail,
        string? recipientName,
        string subject,
        string body,
        IReadOnlyList<EmailAttachment> attachments,
        CancellationToken cancellationToken = default)
        => SendWithAttachmentsResultAsync(toEmail, subject, body, attachments, cancellationToken);

    /// <summary>Used by the admin test endpoint to report which transport was selected.</summary>
    internal async Task<EmailSendResult> SendTestEmailWithResultAsync(string toEmail, CancellationToken cancellationToken = default)
    {
        var body =
            $"This is a test email from {AppBranding.AppName}.\n\n" +
            "If you received this message, outbound email is configured correctly.\n\n" +
            $"— {AppBranding.AppName}";
        return await SendWithResultAsync(toEmail, $"{AppBranding.AppName} test email", body, cancellationToken);
    }

    private async Task SendAsync(string toEmail, string subject, string body, CancellationToken cancellationToken)
    {
        try
        {
            await SendWithResultAsync(toEmail, subject, body, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected email failure for {ToEmail} subject {Subject}", toEmail, subject);
        }
    }

    private async Task<EmailSendResult> SendWithResultAsync(
        string toEmail,
        string subject,
        string body,
        CancellationToken cancellationToken)
    {
        var result = await SendWithAttachmentsResultAsync(toEmail, subject, body, Array.Empty<EmailAttachment>(), cancellationToken);
        return new EmailSendResult(result.Success, result.Mode, result.Message);
    }

    private async Task<AssetReportEmailDeliveryResult> SendWithAttachmentsResultAsync(
        string toEmail,
        string subject,
        string body,
        IReadOnlyList<EmailAttachment> attachments,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(toEmail))
        {
            _logger.LogWarning("Email skipped — recipient address is empty. Subject: {Subject}", subject);
            return new AssetReportEmailDeliveryResult(false, "skipped", "Recipient email is required.");
        }

        var settings = await _settingsService.GetEmailSettingsAsync();
        var smtpFromAddress = ResolveSmtpFromAddress(settings);
        var resendFromHeader = FormatFromHeader(AppBranding.EmailFromName, AppBranding.EmailFromAddress);

        var apiKey = ResolveResendApiKey();
        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            var sent = await TrySendViaResendAsync(apiKey, resendFromHeader, toEmail.Trim(), subject, body, attachments, cancellationToken);
            if (sent.Success)
            {
                return new AssetReportEmailDeliveryResult(true, sent.Mode, sent.Message);
            }

            _logger.LogWarning(
                "Resend delivery failed for {ToEmail}; attempting SMTP fallback if configured. Detail: {Detail}",
                toEmail,
                sent.Message);
        }

        if (!string.IsNullOrWhiteSpace(settings.SmtpHost))
        {
            var sent = await TrySendViaSmtpAsync(settings, smtpFromAddress, toEmail.Trim(), subject, body, attachments, cancellationToken);
            if (sent.Success)
            {
                return new AssetReportEmailDeliveryResult(true, sent.Mode, sent.Message);
            }

            _logger.LogWarning(
                "SMTP delivery failed for {ToEmail}. Detail: {Detail}",
                toEmail,
                sent.Message);
        }

        _logger.LogInformation(
            "Email simulated (no Resend key and no SMTP host). To: {To} From: {From} Subject: {Subject} Attachments: {Count}",
            toEmail,
            resendFromHeader,
            subject,
            attachments.Count);
        return new AssetReportEmailDeliveryResult(true, "simulated", "No Resend API key or SMTP host configured — message logged only.");
    }

    private Task<EmailSendResult> TrySendViaResendAsync(
        string apiKey,
        string fromHeader,
        string toEmail,
        string subject,
        string body,
        CancellationToken cancellationToken)
        => TrySendViaResendAsync(apiKey, fromHeader, toEmail, subject, body, Array.Empty<EmailAttachment>(), cancellationToken);

    private async Task<EmailSendResult> TrySendViaResendAsync(
        string apiKey,
        string fromHeader,
        string toEmail,
        string subject,
        string body,
        IReadOnlyList<EmailAttachment> attachments,
        CancellationToken cancellationToken)
    {
        var payload = new ResendEmailPayload
        {
            From = fromHeader,
            To = [toEmail],
            Subject = subject,
            Text = body,
            ReplyTo = AppBranding.EmailReplyToAddress,
            Attachments = attachments.Count == 0
                ? null
                : attachments.Select(a => new ResendAttachmentPayload
                {
                    Filename = a.FileName,
                    Content = Convert.ToBase64String(a.Content),
                }).ToList(),
        };

        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, ResendApiUrl);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
                request.Content = new StringContent(
                    JsonSerializer.Serialize(payload, JsonOptions),
                    Encoding.UTF8,
                    "application/json");

                var client = _httpClientFactory.CreateClient(nameof(ResendEmailService));
                using var response = await client.SendAsync(request, cancellationToken);
                var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation("Email sent via Resend to {ToEmail} subject {Subject}", toEmail, subject);
                    return new EmailSendResult(true, "resend", "Sent via Resend.");
                }

                var retryable = (int)response.StatusCode >= 500 || response.StatusCode == HttpStatusCode.TooManyRequests;
                _logger.LogWarning(
                    "Resend attempt {Attempt}/{MaxAttempts} failed ({StatusCode}) for {ToEmail}: {Response}",
                    attempt,
                    MaxAttempts,
                    (int)response.StatusCode,
                    toEmail,
                    Truncate(responseBody, 500));

                if (!retryable || attempt == MaxAttempts)
                {
                    return new EmailSendResult(false, "resend", $"Resend returned {(int)response.StatusCode}: {Truncate(responseBody, 200)}");
                }
            }
            catch (Exception ex) when (attempt < MaxAttempts && IsTransient(ex))
            {
                _logger.LogWarning(ex, "Transient Resend error attempt {Attempt}/{MaxAttempts} for {ToEmail}", attempt, MaxAttempts, toEmail);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Resend send failed for {ToEmail}", toEmail);
                return new EmailSendResult(false, "resend", ex.Message);
            }

            await Task.Delay(TimeSpan.FromMilliseconds(250 * attempt), cancellationToken);
        }

        return new EmailSendResult(false, "resend", "Resend delivery failed after retries.");
    }

    private static Task<EmailSendResult> TrySendViaSmtpAsync(
        EmailSettings settings,
        string fromAddress,
        string toEmail,
        string subject,
        string body,
        CancellationToken cancellationToken)
        => TrySendViaSmtpAsync(settings, fromAddress, toEmail, subject, body, Array.Empty<EmailAttachment>(), cancellationToken);

    private static async Task<EmailSendResult> TrySendViaSmtpAsync(
        EmailSettings settings,
        string fromAddress,
        string toEmail,
        string subject,
        string body,
        IReadOnlyList<EmailAttachment> attachments,
        CancellationToken cancellationToken)
    {
        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            try
            {
                using var client = new SmtpClient(settings.SmtpHost, settings.SmtpPort)
                {
                    EnableSsl = settings.UseSsl,
                };

                if (!string.IsNullOrWhiteSpace(settings.Username))
                {
                    client.Credentials = new NetworkCredential(settings.Username, settings.Password);
                }

                using var mail = new MailMessage(fromAddress, toEmail, subject, body);
                foreach (var attachment in attachments)
                {
                    mail.Attachments.Add(new Attachment(new MemoryStream(attachment.Content), attachment.FileName));
                }
                await client.SendMailAsync(mail, cancellationToken);
                return new EmailSendResult(true, "smtp", "Sent via SMTP.");
            }
            catch (Exception ex) when (attempt < MaxAttempts && IsTransient(ex))
            {
                await Task.Delay(TimeSpan.FromMilliseconds(250 * attempt), cancellationToken);
            }
            catch (Exception ex)
            {
                return new EmailSendResult(false, "smtp", ex.Message);
            }
        }

        return new EmailSendResult(false, "smtp", "SMTP delivery failed after retries.");
    }

    private string? ResolveResendApiKey()
    {
        return FirstNonEmpty(
            _config["Email:ResendApiKey"],
            _config["Resend:ApiKey"],
            Environment.GetEnvironmentVariable("Email__ResendApiKey"),
            Environment.GetEnvironmentVariable("Resend__ApiKey"));
    }

    private static string ResolveSmtpFromAddress(EmailSettings settings)
        => string.IsNullOrWhiteSpace(settings.FromAddress)
            ? AppBranding.EmailFromAddress
            : settings.FromAddress.Trim();

    private static string ResolveSmtpFromName(EmailSettings settings)
        => string.IsNullOrWhiteSpace(settings.FromName)
            ? AppBranding.EmailFromName
            : settings.FromName.Trim();

    private static string FormatFromHeader(string fromName, string fromAddress)
        => $"{fromName} <{fromAddress}>";

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return null;
    }

    private static bool IsTransient(Exception ex)
        => ex is HttpRequestException or TaskCanceledException or IOException or SmtpException;

    private static string Truncate(string value, int maxLength)
        => value.Length <= maxLength ? value : value[..maxLength] + "…";

    private sealed class ResendEmailPayload
    {
        public string From { get; set; } = "";
        public List<string> To { get; set; } = [];
        public string Subject { get; set; } = "";
        public string Text { get; set; } = "";
        public string? ReplyTo { get; set; }
        public List<ResendAttachmentPayload>? Attachments { get; set; }
    }

    private sealed class ResendAttachmentPayload
    {
        public string Filename { get; set; } = "";
        public string Content { get; set; } = "";
    }

    internal sealed record EmailSendResult(bool Success, string Mode, string? Message);
}
