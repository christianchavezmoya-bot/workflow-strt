using Microsoft.Data.Sqlite;

namespace Commtrac.Api.Services;

public sealed class SqliteBackupOptions
{
    public bool Enabled { get; set; } = true;
    public string Directory { get; set; } = "backups";
    public int IntervalHours { get; set; } = 24;
    public int RetentionDays { get; set; } = 14;
}

public sealed record SqliteBackupInfo(string FileName, string FullPath, long SizeBytes, DateTime CreatedAtUtc);

public sealed class SqliteBackupService : BackgroundService
{
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly SqliteBackupOptions _options;
    private readonly SemaphoreSlim _mutex = new(1, 1);

    public SqliteBackupService(IConfiguration configuration, IWebHostEnvironment environment, IServiceScopeFactory scopeFactory)
    {
        _configuration = configuration;
        _environment = environment;
        _scopeFactory = scopeFactory;
        _options = configuration.GetSection("DatabaseBackups").Get<SqliteBackupOptions>() ?? new SqliteBackupOptions();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled) return;

        await EnsureRecentBackupAsync(stoppingToken);

        var interval = TimeSpan.FromHours(Math.Max(1, _options.IntervalHours));
        using var timer = new PeriodicTimer(interval);
        while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
        {
            await EnsureRecentBackupAsync(stoppingToken);
        }
    }

    public Task<IReadOnlyList<SqliteBackupInfo>> ListBackupsAsync()
    {
        var directory = GetBackupDirectory();
        if (!Directory.Exists(directory)) return Task.FromResult<IReadOnlyList<SqliteBackupInfo>>([]);

        var files = new DirectoryInfo(directory)
            .EnumerateFiles("*.db", SearchOption.TopDirectoryOnly)
            .OrderByDescending(f => f.CreationTimeUtc)
            .Select(f => new SqliteBackupInfo(f.Name, f.FullName, f.Length, f.CreationTimeUtc))
            .ToList();

        return Task.FromResult<IReadOnlyList<SqliteBackupInfo>>(files);
    }

    public async Task<SqliteBackupInfo> CreateBackupAsync(string reason, CancellationToken cancellationToken = default)
    {
        await _mutex.WaitAsync(cancellationToken);
        try
        {
            var directory = GetBackupDirectory();
            Directory.CreateDirectory(directory);

            var timestamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
            var fileName = $"commtrac-{timestamp}.db";
            var backupPath = Path.Combine(directory, fileName);
            var sourcePath = GetDatabasePath();

            var sourceBuilder = new SqliteConnectionStringBuilder { DataSource = sourcePath, Mode = SqliteOpenMode.ReadOnly };
            var destinationBuilder = new SqliteConnectionStringBuilder { DataSource = backupPath, Mode = SqliteOpenMode.ReadWriteCreate };

            await using (var source = new SqliteConnection(sourceBuilder.ToString()))
            await using (var destination = new SqliteConnection(destinationBuilder.ToString()))
            {
                await source.OpenAsync(cancellationToken);
                await destination.OpenAsync(cancellationToken);
                source.BackupDatabase(destination);
            }

            await PruneOldBackupsAsync(cancellationToken);

            using var scope = _scopeFactory.CreateScope();
            var audit = scope.ServiceProvider.GetRequiredService<AuditLogService>();
            await audit.LogSystemAsync("database_backup_created", $"{fileName} ({reason})");

            var file = new FileInfo(backupPath);
            return new SqliteBackupInfo(file.Name, file.FullName, file.Length, file.CreationTimeUtc);
        }
        finally
        {
            _mutex.Release();
        }
    }

    private async Task EnsureRecentBackupAsync(CancellationToken cancellationToken)
    {
        var backups = await ListBackupsAsync();
        var latest = backups.FirstOrDefault();
        if (latest is not null && latest.CreatedAtUtc >= DateTime.UtcNow.AddHours(-Math.Max(1, _options.IntervalHours)))
        {
            return;
        }

        await CreateBackupAsync("scheduled", cancellationToken);
    }

    private async Task PruneOldBackupsAsync(CancellationToken cancellationToken)
    {
        var retentionCutoff = DateTime.UtcNow.AddDays(-Math.Max(1, _options.RetentionDays));
        var backups = await ListBackupsAsync();
        foreach (var backup in backups.Where(b => b.CreatedAtUtc < retentionCutoff))
        {
            if (File.Exists(backup.FullPath))
            {
                File.Delete(backup.FullPath);
            }
        }
    }

    private string GetBackupDirectory() => Path.GetFullPath(Path.Combine(_environment.ContentRootPath, _options.Directory));

    private string GetDatabasePath()
    {
        var cs = _configuration.GetConnectionString("DefaultConnection") ?? "Data Source=commtrac.db";
        var builder = new SqliteConnectionStringBuilder(cs);
        var dataSource = builder.DataSource;
        return Path.GetFullPath(Path.IsPathRooted(dataSource) ? dataSource : Path.Combine(_environment.ContentRootPath, dataSource));
    }
}
