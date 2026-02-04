using Microsoft.Extensions.Options;

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
    private readonly SmsSettings _settings;
    private readonly ILogger<SmsSender> _logger;

    public SmsSender(IOptions<SmsSettings> options, ILogger<SmsSender> logger)
    {
        _settings = options.Value;
        _logger = logger;
    }

    public Task SendAsync(string toNumber, string message)
    {
        if (string.IsNullOrWhiteSpace(_settings.Provider) || string.IsNullOrWhiteSpace(_settings.ApiKey))
        {
            _logger.LogInformation("SMS (simulated). To: {To} Message: {Message}", toNumber, message);
            return Task.CompletedTask;
        }

        // TODO: Integrate with real SMS provider.
        _logger.LogInformation("SMS (provider {Provider}). To: {To} Message: {Message}", _settings.Provider, toNumber, message);
        return Task.CompletedTask;
    }
}
