using System.Text.Json;
using Commtrac.Api.Schemas;

namespace Commtrac.Api.Services;

public sealed class ValidationResult
{
    public bool IsValid { get; init; }
    public string? Error { get; init; }
    public CanonicalInspection? Parsed { get; init; }

    public static ValidationResult Fail(string error) => new() { IsValid = false, Error = error };
    public static ValidationResult Ok(CanonicalInspection parsed) => new() { IsValid = true, Parsed = parsed };
}

public interface IInspectionImportValidatorService
{
    ValidationResult Validate(string? rawJson);
}

public sealed class InspectionImportValidatorService : IInspectionImportValidatorService
{
    private static readonly JsonSerializerOptions _options = new() { PropertyNameCaseInsensitive = true };

    public ValidationResult Validate(string? rawJson)
    {
        if (string.IsNullOrWhiteSpace(rawJson))
            return ValidationResult.Fail("JSON is empty.");

        CanonicalInspection? parsed;
        try
        {
            parsed = JsonSerializer.Deserialize<CanonicalInspection>(rawJson, _options);
        }
        catch (JsonException ex)
        {
            return ValidationResult.Fail($"Invalid JSON: {ex.Message}");
        }

        if (parsed is null)
            return ValidationResult.Fail("JSON resolved to null.");

        if (string.IsNullOrWhiteSpace(parsed.InspectionDate))
            return ValidationResult.Fail("Required field 'inspectionDate' is missing or empty.");

        if (!DateTime.TryParse(parsed.InspectionDate, out _))
            return ValidationResult.Fail($"'inspectionDate' is not a valid date: '{parsed.InspectionDate}'.");

        for (int i = 0; i < parsed.Results.Count; i++)
        {
            if (string.IsNullOrWhiteSpace(parsed.Results[i].CheckId))
                return ValidationResult.Fail($"results[{i}].checkId is required.");
        }

        return ValidationResult.Ok(parsed);
    }
}
