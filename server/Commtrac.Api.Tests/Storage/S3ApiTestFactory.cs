using Amazon.S3;
using Commtrac.Api.Services.Storage;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Commtrac.Api.Tests.Storage;

/// <summary>
/// Same as ApiTestFactory, but boots the real API with IFileStorageService wired to
/// S3FileStorageService backed by FakeSeekResistantS3Client — so ServeMedia is exercised
/// end-to-end (real controller, real HTTP status/header writing) against S3-shaped storage,
/// not just LocalFileStorageService as the rest of the suite (including PR #352's own
/// tests) does.
/// </summary>
public class S3ApiTestFactory : ApiTestFactory
{
    public const string KeyPrefix = "test-prefix";
    public readonly FakeSeekResistantS3Client S3 = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAmazonS3>();
            services.RemoveAll<IFileStorageService>();
            services.AddSingleton<IAmazonS3>(S3);
            services.AddSingleton<IFileStorageService>(_ =>
                new S3FileStorageService(S3, Options.Create(new StorageOptions { Provider = "S3", Bucket = "test-bucket", KeyPrefix = KeyPrefix })));
        });
    }
}
