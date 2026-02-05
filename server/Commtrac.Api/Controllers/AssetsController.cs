using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/assets")]
[Authorize]
public class AssetsController : ControllerBase
{
    private readonly AppDbContext _db;

    public AssetsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AssetDto>>> GetAll()
    {
        var assets = await _db.Assets.OrderBy(a => a.Seq).ToListAsync();
        return Ok(assets.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<AssetDto>> Create([FromBody] CreateAssetRequest request)
    {
        var maxSeq = await _db.Assets.MaxAsync(a => (int?)a.Seq) ?? 0;

        var asset = new AssetEntity
        {
            Seq = maxSeq + 1,
            MachineType = request.MachineType,
            MachineId = request.MachineId,
            SerialNumber = request.SerialNumber,
            PmCount = request.PmCount,
            Comments = request.Comments
        };

        _db.Assets.Add(asset);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), new { id = asset.Id }, ToDto(asset));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<AssetDto>> Update(string id, [FromBody] UpdateAssetRequest request)
    {
        var asset = await _db.Assets.FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null)
        {
            return NotFound();
        }

        if (!string.IsNullOrWhiteSpace(request.MachineType)) asset.MachineType = request.MachineType;
        if (!string.IsNullOrWhiteSpace(request.MachineId)) asset.MachineId = request.MachineId;
        if (!string.IsNullOrWhiteSpace(request.SerialNumber)) asset.SerialNumber = request.SerialNumber;
        if (!string.IsNullOrWhiteSpace(request.PmCount)) asset.PmCount = request.PmCount;
        if (request.Comments is not null) asset.Comments = request.Comments;

        await _db.SaveChangesAsync();
        return Ok(ToDto(asset));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var asset = await _db.Assets.FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null)
        {
            return NotFound();
        }

        _db.Assets.Remove(asset);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static AssetDto ToDto(AssetEntity asset)
        => new(
            asset.Id,
            asset.Seq,
            asset.MachineType,
            asset.MachineId,
            asset.SerialNumber,
            asset.PmCount,
            asset.Comments
        );
}
