namespace Commtrac.Api.Services;

public sealed class EmailSettings
{
    public string SmtpHost { get; set; } = "";
    public int SmtpPort { get; set; } = 25;
    public bool UseSsl { get; set; } = false;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public string FromAddress { get; set; } = AppBranding.EmailFromAddress;
    public string FromName { get; set; } = AppBranding.EmailFromName;
    public string FrontendBaseUrl { get; set; } = "";
}

