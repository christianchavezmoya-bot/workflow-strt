using System.Net;
using System.Text;
using System.Security.Claims;
using Commtrac.Api.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Commtrac.Api.Services;
using Commtrac.Api.Swagger;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddHttpClient();

// Resolve DB path relative to ContentRootPath (project dir) so it can never resolve
// to the bin/Debug output folder regardless of how the process is started.
var rawConnectionString = builder.Configuration.GetConnectionString("DefaultConnection") ?? "Data Source=commtrac.db";
var dbDataSource = rawConnectionString.Replace("Data Source=", "", StringComparison.OrdinalIgnoreCase).Trim();
if (!Path.IsPathRooted(dbDataSource))
    dbDataSource = Path.Combine(builder.Environment.ContentRootPath, dbDataSource);
var resolvedConnectionString = $"Data Source={dbDataSource}";
Console.WriteLine($"[DB] Resolved path: {dbDataSource}");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(resolvedConnectionString));

builder.Services.AddScoped<IInspectionImportAdapterService, InspectionImportAdapterService>();
builder.Services.AddScoped<IInspectionImportValidatorService, InspectionImportValidatorService>();
builder.Services.AddScoped<NotificationSettingsService>();
builder.Services.AddScoped<NotificationFeedService>();
builder.Services.AddScoped<ProjectLifecycleService>();
builder.Services.AddSingleton<SseHub>();
builder.Services.AddSingleton<SqliteBackupService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<SqliteBackupService>());
builder.Services.AddScoped<RecoveryService>();
builder.Services.Configure<EmailSettings>(builder.Configuration.GetSection("Email"));
builder.Services.AddHttpClient(nameof(ResendEmailService));
builder.Services.AddScoped<ResendEmailService>();
builder.Services.AddScoped<IEmailService>(sp => sp.GetRequiredService<ResendEmailService>());
builder.Services.AddScoped<IEmailSender>(sp => sp.GetRequiredService<ResendEmailService>());
builder.Services.Configure<SmsSettings>(builder.Configuration.GetSection("Sms"));
builder.Services.AddScoped<ISmsSender, SmsSender>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<IDocumentContentSearchService, DocumentContentSearchService>();
builder.Services.AddSingleton<DocumentSearchIndexStatusStore>();
builder.Services.AddSingleton<IDocumentSearchIndexMonitor>(sp => sp.GetRequiredService<DocumentSearchIndexStatusStore>());
builder.Services.AddSingleton<DocumentSearchIndexQueue>();
builder.Services.AddSingleton<IDocumentSearchIndexQueue>(sp => sp.GetRequiredService<DocumentSearchIndexQueue>());
builder.Services.AddSingleton<IDocumentSearchIndexChannel>(sp => sp.GetRequiredService<DocumentSearchIndexQueue>());
builder.Services.AddSingleton<IDocumentSearchIndexQueueMetrics>(sp => sp.GetRequiredService<DocumentSearchIndexQueue>());
builder.Services.AddHostedService<DocumentSearchIndexWorker>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
    {
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

var jwtKey = builder.Configuration["Jwt:Key"] ?? "dev-only-change-me";
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

builder.Services.AddAuthorization();

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
    app.UseHttpsRedirection();
}

app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

// Exposes the implicit Program class to the test project's WebApplicationFactory<Program>.
public partial class Program { }
