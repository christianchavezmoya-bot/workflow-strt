using System.Net;
using System.Text;
using System.Security.Claims;
using Commtrac.Api.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Commtrac.Api.Hosting;
using Commtrac.Api.Middleware;
using Commtrac.Api.Services;
using Commtrac.Api.Services.Storage;
using Commtrac.Api.Swagger;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

HostingSecretGuard.ValidateProductionSecrets(builder.Configuration, builder.Environment);

builder.Services.AddControllers();
builder.Services.AddHttpClient();

// Database provider: Sqlite (default, unchanged local dev) or Postgres (cloud parity).
var dbProvider = builder.Configuration["Database:Provider"] ?? "Sqlite";
var rawConnectionString = builder.Configuration.GetConnectionString("DefaultConnection") ?? "Data Source=commtrac.db";
string resolvedConnectionString;

if (string.Equals(dbProvider, "Postgres", StringComparison.OrdinalIgnoreCase))
{
    resolvedConnectionString = rawConnectionString;
    Console.WriteLine("[DB] Provider: Postgres");
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseNpgsql(resolvedConnectionString));
}
else
{
    // Resolve DB path relative to ContentRootPath (project dir) so it can never resolve
    // to the bin/Debug output folder regardless of how the process is started.
    var dbDataSource = rawConnectionString.Replace("Data Source=", "", StringComparison.OrdinalIgnoreCase).Trim();
    if (!Path.IsPathRooted(dbDataSource))
        dbDataSource = Path.Combine(builder.Environment.ContentRootPath, dbDataSource);
    resolvedConnectionString = $"Data Source={dbDataSource}";
    Console.WriteLine($"[DB] Provider: Sqlite");
    Console.WriteLine($"[DB] Resolved path: {dbDataSource}");

    const long freshDbWarningBytes = 5L * 1024 * 1024;
    if (File.Exists(dbDataSource))
    {
        var dbSizeBytes = new FileInfo(dbDataSource).Length;
        Console.WriteLine($"[DB] File size: {dbSizeBytes / (1024.0 * 1024.0):F2} MB");
        if (dbSizeBytes < freshDbWarningBytes)
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("[DB] WARNING: Database file is very small (< 5 MB).");
            Console.WriteLine("[DB] You may be on a fresh seed DB, not your populated workflow database.");
            Console.WriteLine("[DB] Set ConnectionStrings:DefaultConnection to your real commtrac.db (user-secrets or env var).");
            Console.WriteLine("[DB] See docs/TIME_ANALYTICS_DEV.md");
            Console.ResetColor();
        }
    }
    else
    {
        Console.WriteLine("[DB] File does not exist yet — will be created on first migration.");
    }

    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlite(resolvedConnectionString));
}

builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection(StorageOptions.SectionName));
var storageProvider = builder.Configuration["Storage:Provider"] ?? "Local";
if (string.Equals(storageProvider, "S3", StringComparison.OrdinalIgnoreCase))
{
    var storageOptions = builder.Configuration.GetSection(StorageOptions.SectionName).Get<StorageOptions>()
        ?? new StorageOptions();
    if (string.IsNullOrWhiteSpace(storageOptions.Bucket))
    {
        throw new InvalidOperationException("Storage:Bucket is required when Storage:Provider=S3.");
    }

    builder.Services.AddSingleton<Amazon.S3.IAmazonS3>(_ => S3ClientFactory.Create(storageOptions));
    builder.Services.AddSingleton<IFileStorageService, S3FileStorageService>();
    Console.WriteLine($"[Storage] Provider: S3 (bucket={storageOptions.Bucket})");
}
else
{
    builder.Services.AddSingleton<IFileStorageService, LocalFileStorageService>();
    Console.WriteLine("[Storage] Provider: Local");
}
builder.Services.AddScoped<IInspectionImportAdapterService, InspectionImportAdapterService>();
builder.Services.AddScoped<IInspectionImportValidatorService, InspectionImportValidatorService>();
builder.Services.AddScoped<NotificationSettingsService>();
builder.Services.AddScoped<NotificationFeedService>();
builder.Services.Configure<PushSettings>(builder.Configuration.GetSection(PushSettings.SectionName));
builder.Services.AddScoped<PushNotificationDeliveryService>();
builder.Services.AddScoped<ProjectLifecycleService>();
builder.Services.AddScoped<WorkflowCompletenessService>();
builder.Services.AddScoped<RolePermissionService>();
builder.Services.AddSingleton<SseHub>();
builder.Services.AddSingleton<SqliteBackupService>();
if (!string.Equals(dbProvider, "Postgres", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddHostedService(sp => sp.GetRequiredService<SqliteBackupService>());
}
builder.Services.AddScoped<RecoveryService>();
builder.Services.Configure<EmailSettings>(builder.Configuration.GetSection("Email"));
builder.Services.AddHttpClient(nameof(ResendEmailService));
builder.Services.AddScoped<ResendEmailService>();
builder.Services.AddScoped<IEmailService>(sp => sp.GetRequiredService<ResendEmailService>());
builder.Services.AddScoped<IEmailSender>(sp => sp.GetRequiredService<ResendEmailService>());
builder.Services.Configure<SmsSettings>(builder.Configuration.GetSection("Sms"));
builder.Services.AddScoped<ISmsSender, SmsSender>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddHostedService<ProjectScheduledReportWorker>();
builder.Services.AddScoped<IDocumentContentSearchService, DocumentContentSearchService>();
builder.Services.AddScoped<TimeAnalyticsSnapshotService>();
builder.Services.AddSingleton<DocumentSearchIndexStatusStore>();
builder.Services.AddSingleton<IDocumentSearchIndexMonitor>(sp => sp.GetRequiredService<DocumentSearchIndexStatusStore>());
builder.Services.AddSingleton<DocumentSearchIndexQueue>();
builder.Services.AddSingleton<IDocumentSearchIndexQueue>(sp => sp.GetRequiredService<DocumentSearchIndexQueue>());
builder.Services.AddSingleton<IDocumentSearchIndexChannel>(sp => sp.GetRequiredService<DocumentSearchIndexQueue>());
builder.Services.AddSingleton<IDocumentSearchIndexQueueMetrics>(sp => sp.GetRequiredService<DocumentSearchIndexQueue>());
builder.Services.AddHostedService<DocumentSearchIndexWorker>();

var configuredCorsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?.Where(origin => !string.IsNullOrWhiteSpace(origin))
    .ToArray();

builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
    {
        if (configuredCorsOrigins is { Length: > 0 })
        {
            policy
                .WithOrigins(configuredCorsOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
            return;
        }

        policy
            .SetIsOriginAllowed(origin =>
            {
                var host = new Uri(origin).Host;
                return host == "localhost"
                    || host == "127.0.0.1"
                    || host.StartsWith("10.")
                    || host.StartsWith("192.168.")
                    || host.StartsWith("172.")
                    || IPAddress.TryParse(host, out _); // allow any IP-based origin
            })
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var jwtKey = JwtKeyResolver.Resolve(builder.Configuration, builder.Environment);
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "commtrac";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "commtrac-ui";
var keyBytes = Encoding.UTF8.GetBytes(jwtKey);

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Prevent "role" in the JWT from being remapped to the long ClaimTypes.Role URI.
        // Without this, JwtSecurityTokenHandler/JsonWebTokenHandler converts "role" → the
        // long URI, which doesn't match RoleClaimType = "role" → all role-restricted
        // endpoints return 403 even for valid admins.
        options.MapInboundClaims = false;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(keyBytes),
            // JwtSecurityTokenHandler serialises ClaimTypes.Role → "role" when writing the token.
            // Without this, [Authorize(Roles="...")] can't find the claim because it looks for
            // the long WS-Federation URI (ClaimTypes.Role) not the short "role" key.
            RoleClaimType = "role",
            NameClaimType = "unique_name"
        };

        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = context =>
            {
                if (context.Principal?.Identity is not ClaimsIdentity identity)
                {
                    return Task.CompletedTask;
                }

                static void AddClaimIfMissing(ClaimsIdentity claimsIdentity, string sourceType, string targetType)
                {
                    if (claimsIdentity.HasClaim(c => c.Type == targetType))
                    {
                        return;
                    }

                    var source = claimsIdentity.FindFirst(sourceType);
                    if (source is null || string.IsNullOrWhiteSpace(source.Value))
                    {
                        return;
                    }

                    claimsIdentity.AddClaim(new Claim(targetType, source.Value));
                }

                // Map short JWT claim names back onto ClaimTypes so the existing controllers
                // keep working even with MapInboundClaims disabled.
                AddClaimIfMissing(identity, "nameid", ClaimTypes.NameIdentifier);
                AddClaimIfMissing(identity, "email", ClaimTypes.Email);
                AddClaimIfMissing(identity, "unique_name", ClaimTypes.Name);
                AddClaimIfMissing(identity, "role", ClaimTypes.Role);

                return Task.CompletedTask;
            }
        };
    });

// Authenticated-by-default. Without a fallback policy, a controller that simply forgets
// [Authorize] is served anonymously — which is how the BOM, admin-tab, installation-tab
// and table-config endpoints ended up publicly readable. Endpoints that are genuinely
// public (health, login, external signing, report shares, mobile upload, SSE) opt out
// explicitly with [AllowAnonymous]; anything new is protected unless it says otherwise.
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "Commtrac API", Version = "v1" });
    options.MapType<IFormFile>(() => new OpenApiSchema { Type = "string", Format = "binary" });
    options.OperationFilter<FileUploadOperationFilter>();
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    DbInitializer.Initialize(db, app.Configuration);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (!app.Environment.IsDevelopment())
{
    app.UseForwardedHeaders(new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
    });
    app.UseHttpsRedirection();
}

app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.UseMiddleware<ApiTimingMiddleware>();
}

app.MapControllers();

app.Run();

// Exposes the implicit Program class to the test project's WebApplicationFactory<Program>.
public partial class Program { }


