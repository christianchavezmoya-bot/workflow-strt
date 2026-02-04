using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/inspections")]
[Authorize]
public class InspectionsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly NotificationService _notifications;

    public InspectionsController(
        AppDbContext db,
        IWebHostEnvironment env,
        NotificationService notifications)
    {
        _db = db;
        _env = env;
        _notifications = notifications;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<InspectionDto>>> GetAll()
    {
        var inspections = await _db.Inspections.OrderByDescending(i => i.ScheduledDate).ToListAsync();
        return Ok(inspections.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<InspectionDto>> Create([FromBody] InspectionDto request)
    {
        var inspection = new InspectionEntity
        {
            Id = string.IsNullOrWhiteSpace(request.Id) ? Guid.NewGuid().ToString() : request.Id,
            InstallationId = request.InstallationId,
            Name = request.Name,
            Inspector = request.Inspector,
            Status = request.Status,
            PhotoCount = request.PhotoCount,
            ScheduledDate = request.ScheduledDate
        };

        _db.Inspections.Add(inspection);
        await _db.SaveChangesAsync();
        await _notifications.NotifyInspectionAssignedAsync(inspection);
        return CreatedAtAction(nameof(GetAll), new { id = inspection.Id }, ToDto(inspection));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<InspectionDto>> Update(string id, [FromBody] InspectionDto request)
    {
        var inspection = await _db.Inspections.FirstOrDefaultAsync(i => i.Id == id);
        if (inspection is null)
        {
            return NotFound();
        }

        inspection.InstallationId = request.InstallationId;
        inspection.Name = request.Name;
        inspection.Inspector = request.Inspector;
        inspection.Status = request.Status;
        inspection.PhotoCount = request.PhotoCount;
        inspection.ScheduledDate = request.ScheduledDate;

        await _db.SaveChangesAsync();
        return Ok(ToDto(inspection));
    }

    [HttpGet("{id}/photos")]
    public async Task<ActionResult<IEnumerable<InspectionPhotoDto>>> GetPhotos(string id)
    {
        var photos = await _db.InspectionPhotos.Where(p => p.InspectionId == id).OrderByDescending(p => p.UploadedAt).ToListAsync();
        return Ok(photos.Select(photo => ToPhotoDto(photo, Request)));
    }

    [HttpPost("{id}/photos")]
    [Authorize(Roles = "Admin,Project Manager")]
    [RequestSizeLimit(50_000_000)]
    public async Task<ActionResult<InspectionPhotoDto>> UploadPhoto(string id, [FromForm] UploadInspectionPhotoRequest request)
    {
        var inspection = await _db.Inspections.FirstOrDefaultAsync(i => i.Id == id);
        if (inspection is null)
        {
            return NotFound();
        }

        if (request.File == null || request.File.Length == 0)
        {
            return BadRequest("File is required.");
        }

        var storageRoot = Path.Combine(_env.ContentRootPath, "Storage", "InspectionPhotos", id);
        Directory.CreateDirectory(storageRoot);

        var extension = Path.GetExtension(request.File.FileName);
        var storedName = $"{Guid.NewGuid()}{extension}";
        var storedPath = Path.Combine(storageRoot, storedName);

        await using (var stream = System.IO.File.Create(storedPath))
        {
            await request.File.CopyToAsync(stream);
        }

        var photo = new InspectionPhotoEntity
        {
            InspectionId = id,
            FileName = request.File.FileName,
            FilePath = Path.Combine("Storage", "InspectionPhotos", id, storedName),
            ContentType = request.File.ContentType,
            FileSize = request.File.Length,
            UploadedAt = DateTime.UtcNow.ToString("s")
        };

        _db.InspectionPhotos.Add(photo);
        inspection.PhotoCount += 1;
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetPhotos), new { id }, ToPhotoDto(photo, Request));
    }

    [HttpGet("photos/{photoId}/download")]
    public async Task<IActionResult> DownloadPhoto(string photoId)
    {
        var photo = await _db.InspectionPhotos.FirstOrDefaultAsync(p => p.Id == photoId);
        if (photo is null || string.IsNullOrWhiteSpace(photo.FilePath))
        {
            return NotFound();
        }

        var fullPath = Path.Combine(_env.ContentRootPath, photo.FilePath);
        if (!System.IO.File.Exists(fullPath))
        {
            return NotFound();
        }

        var contentType = string.IsNullOrWhiteSpace(photo.ContentType) ? "application/octet-stream" : photo.ContentType;
        return PhysicalFile(fullPath, contentType, photo.FileName);
    }

    private static InspectionDto ToDto(InspectionEntity inspection)
        => new(
            inspection.Id,
            inspection.InstallationId,
            inspection.Name,
            inspection.Inspector,
            inspection.Status,
            inspection.PhotoCount,
            inspection.ScheduledDate
        );

    private static InspectionPhotoDto ToPhotoDto(InspectionPhotoEntity photo, HttpRequest request)
        => new(
            photo.Id,
            photo.InspectionId,
            photo.FileName,
            photo.UploadedAt,
            photo.ContentType,
            photo.FileSize,
            string.IsNullOrWhiteSpace(photo.FilePath) ? null : $"{request.Scheme}://{request.Host}/api/inspections/photos/{photo.Id}/download"
        );
}

public class UploadInspectionPhotoRequest
{
    [FromForm(Name = "file")]
    public IFormFile? File { get; set; }
}
