namespace Commtrac.Api.Services;

public sealed class SmsSettings
{
    public string Provider { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public string Sender { get; set; } = "";
}

public interface ISmsSender
{
    Task SendAsync(string toNumber, string message);
}

public sealed class SmsSender : ISmsSender
{
    private readonly NotificationSettingsService _settingsService;
    private readonly ILogger<SmsSender> _logger;

    public SmsSender(NotificationSettingsService settingsService, ILogger<SmsSender> logger)
    {
        _settingsService = settingsService;
        _logger = logger;
    }

    public Task SendAsync(string toNumber, string message)
    {
        // Settings are DB-backed; resolve at send-time.
        return SendCoreAsync(toNumber, message);
    }

    private async Task SendCoreAsync(string toNumber, string message)
    {
        var settings = await _settingsService.GetSmsSettingsAsync();

        if (string.IsNullOrWhiteSpace(settings.Provider) || string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            _logger.LogInformation("SMS (simulated). To: {To} Message: {Message}", toNumber, message);
            return;
        }

        // TODO: Integrate with real SMS provider.
        _logger.LogInformation("SMS (provider {Provider}). To: {To} Message: {Message}", settings.Provider, toNumber, message);
    }
}
