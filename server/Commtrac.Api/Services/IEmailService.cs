namespace Commtrac.Api.Services;

/// <summary>
/// Central outbound email API. Implementations must never throw for delivery failures —
/// callers rely on fire-and-forget behaviour so core app flows continue.
/// </summary>
public interface IEmailService
{
    Task SendTestEmailAsync(string toEmail, CancellationToken cancellationToken = default);

    Task SendInviteAsync(string toEmail, string inviteLink, CancellationToken cancellationToken = default);

    Task SendPasswordResetAsync(string toEmail, string resetLink, CancellationToken cancellationToken = default);

    Task SendNotificationAsync(string toEmail, string subject, string body, CancellationToken cancellationToken = default);

    Task SendSignatureLinkAsync(
        string toEmail,
        string recipientName,
        string signLink,
        string assetName,
        DateTime expiresAtUtc,
        string? customMessage = null,
        CancellationToken cancellationToken = default);

    /// <summary>Field workflow run completed — optional report/sign link for PM/admin.</summary>
    Task SendWorkflowCompletionNotificationAsync(
        string toEmail,
        string assetTag,
        string jobLabel,
        string completedByName,
        string? reportOrSignLink = null,
        CancellationToken cancellationToken = default);
}

/// <summary>Legacy alias — existing controllers depend on this name.</summary>
public interface IEmailSender : IEmailService
{
}
