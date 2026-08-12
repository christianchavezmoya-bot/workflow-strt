using System.Data;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Commtrac.Api.Services;

/// <summary>
/// Provider-aware DDL and ADO.NET helpers for the runtime SearchDocumentChunks index table
/// (not managed by EF migrations).
/// </summary>
internal static class SearchDocumentChunksStore
{
    internal static Task EnsureTableAsync(DbContext db, CancellationToken ct = default)
    {
        var sql = db.Database.IsNpgsql()
            ? """
              CREATE TABLE IF NOT EXISTS "SearchDocumentChunks" (
                  "Id" BIGSERIAL PRIMARY KEY,
                  "SourceType" TEXT NOT NULL,
                  "SourceId" TEXT NOT NULL,
                  "Context" TEXT NOT NULL,
                  "ChunkText" TEXT NOT NULL,
                  "ChunkOrder" INTEGER NOT NULL,
                  "UpdatedAt" TEXT NOT NULL
              );
              CREATE INDEX IF NOT EXISTS "IX_SearchDocumentChunks_Source"
                  ON "SearchDocumentChunks" ("SourceType", "SourceId");
              CREATE INDEX IF NOT EXISTS "IX_SearchDocumentChunks_Order"
                  ON "SearchDocumentChunks" ("SourceType", "SourceId", "ChunkOrder");
              """
            : """
              CREATE TABLE IF NOT EXISTS SearchDocumentChunks (
                  Id INTEGER PRIMARY KEY AUTOINCREMENT,
                  SourceType TEXT NOT NULL,
                  SourceId TEXT NOT NULL,
                  Context TEXT NOT NULL,
                  ChunkText TEXT NOT NULL,
                  ChunkOrder INTEGER NOT NULL,
                  UpdatedAt TEXT NOT NULL
              );
              CREATE INDEX IF NOT EXISTS IX_SearchDocumentChunks_Source ON SearchDocumentChunks(SourceType, SourceId);
              CREATE INDEX IF NOT EXISTS IX_SearchDocumentChunks_Order ON SearchDocumentChunks(SourceType, SourceId, ChunkOrder);
              """;

        return db.Database.ExecuteSqlRawAsync(sql, ct);
    }

    internal static async Task InsertChunksAsync(
        DbContext db,
        string sourceType,
        string sourceId,
        IReadOnlyList<(string Context, string Text, int ChunkOrder)> chunks,
        CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var connection = db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync(ct);
        }

        await using var cmd = connection.CreateCommand();
        cmd.Transaction = tx.GetDbTransaction();
        cmd.CommandText =
            "INSERT INTO SearchDocumentChunks (SourceType, SourceId, Context, ChunkText, ChunkOrder, UpdatedAt) " +
            "VALUES (@sourceType, @sourceId, @context, @chunkText, @chunkOrder, @updatedAt);";

        AddParameter(cmd, "@sourceType");
        AddParameter(cmd, "@sourceId");
        AddParameter(cmd, "@context");
        AddParameter(cmd, "@chunkText");
        AddParameter(cmd, "@chunkOrder");
        AddParameter(cmd, "@updatedAt");

        var now = DateTime.UtcNow.ToString("O");
        foreach (var chunk in chunks)
        {
            SetParameter(cmd, "@sourceType", sourceType);
            SetParameter(cmd, "@sourceId", sourceId);
            SetParameter(cmd, "@context", chunk.Context);
            SetParameter(cmd, "@chunkText", chunk.Text);
            SetParameter(cmd, "@chunkOrder", chunk.ChunkOrder);
            SetParameter(cmd, "@updatedAt", now);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        await tx.CommitAsync(ct);
    }

    internal static async Task<List<IndexedChunkRow>> QueryByFirstTermAsync(
        DbContext db,
        string firstTerm,
        int maxRows,
        CancellationToken ct = default)
    {
        var rows = new List<IndexedChunkRow>();
        var connection = db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync(ct);
        }

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            SELECT SourceType, SourceId, Context, ChunkText, ChunkOrder
            FROM SearchDocumentChunks
            WHERE lower(ChunkText) LIKE @needle
            ORDER BY UpdatedAt DESC, ChunkOrder ASC
            LIMIT @maxRows;
            """;
        SetParameter(cmd, "@needle", $"%{firstTerm.ToLowerInvariant()}%");
        SetParameter(cmd, "@maxRows", Math.Clamp(maxRows, 50, 2000));

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            rows.Add(new IndexedChunkRow(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetInt32(4)));
        }

        return rows;
    }

    internal static async Task<List<IndexedChunkRow>> QueryBySourceAsync(
        DbContext db,
        string sourceType,
        string sourceId,
        int maxRows,
        CancellationToken ct = default)
    {
        var rows = new List<IndexedChunkRow>();
        var connection = db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync(ct);
        }

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = """
            SELECT SourceType, SourceId, Context, ChunkText, ChunkOrder
            FROM SearchDocumentChunks
            WHERE SourceType = @sourceType AND SourceId = @sourceId
            ORDER BY ChunkOrder ASC
            LIMIT @maxRows;
            """;
        SetParameter(cmd, "@sourceType", sourceType);
        SetParameter(cmd, "@sourceId", sourceId);
        SetParameter(cmd, "@maxRows", Math.Clamp(maxRows, 20, 2000));

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            rows.Add(new IndexedChunkRow(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetInt32(4)));
        }

        return rows;
    }

    private static void AddParameter(DbCommand cmd, string name)
    {
        var p = cmd.CreateParameter();
        p.ParameterName = name;
        cmd.Parameters.Add(p);
    }

    private static void SetParameter(DbCommand cmd, string name, object value)
    {
        foreach (DbParameter p in cmd.Parameters)
        {
            if (p.ParameterName == name)
            {
                p.Value = value;
                return;
            }
        }

        throw new InvalidOperationException($"Parameter {name} was not registered.");
    }
}

internal record IndexedChunkRow(
    string SourceType,
    string SourceId,
    string Context,
    string ChunkText,
    int ChunkOrder);
