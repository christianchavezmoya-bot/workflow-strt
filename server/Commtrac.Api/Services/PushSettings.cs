namespace Commtrac.Api.Services;

public sealed class PushSettings
{
    public const string SectionName = "Push";

    public string FirebaseProjectId { get; set; } = string.Empty;
    public string AndroidPackage { get; set; } = string.Empty;
    public string FirebaseServiceAccountJsonPath { get; set; } = string.Empty;
    public ApnsSettings Apns { get; set; } = new();

    public sealed class ApnsSettings
    {
        public string TeamId { get; set; } = string.Empty;
        public string KeyId { get; set; } = string.Empty;
        public string BundleId { get; set; } = string.Empty;
        public string AuthKeyPath { get; set; } = string.Empty;
        public bool UseSandbox { get; set; } = true;
    }
}
