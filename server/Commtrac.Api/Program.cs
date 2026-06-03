using System.Net;
using System.Text;
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
builder.Services.AddSingleton<SqliteBackupService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<SqliteBackupService>());
builder.Services.AddScoped<RecoveryService>();
builder.Services.Configure<EmailSettings>(builder.Configuration.GetSection("Email"));
builder.Services.AddScoped<IEmailSender, EmailSender>();
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
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(keyBytes)
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
