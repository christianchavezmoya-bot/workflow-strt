namespace Commtrac.Api.Utils;

/// <summary>
/// Sync inference of a project's site IANA timezone for reports and public pages.
/// Mirrors frontend <c>inferProjectTimeZoneSync</c> / office label heuristics.
/// </summary>
public static class ProjectTimeZoneResolver
{
    public static string? Resolve(
        string? timeZoneId,
        string? office,
        string? region,
        string? officeCountry = null,
        string? officeState = null)
    {
        if (IsValidTimeZone(timeZoneId)) return timeZoneId;

        var fromOfficeEntity = InferFromLocation(officeCountry, officeState);
        if (IsValidTimeZone(fromOfficeEntity)) return fromOfficeEntity;

        var fromLabel = InferFromOfficeLabel(office);
        if (IsValidTimeZone(fromLabel)) return fromLabel;

        var fromRegion = InferFromLocation(region, null);
        if (IsValidTimeZone(fromRegion)) return fromRegion;

        return null;
    }

    private static bool IsValidTimeZone(string? tz)
    {
        if (string.IsNullOrWhiteSpace(tz)) return false;
        try
        {
            _ = TimeZoneInfo.FindSystemTimeZoneById(tz);
            return true;
        }
        catch
        {
            // IANA ids on Linux; on Windows some ids differ — still try.
            try
            {
                _ = TimeZoneInfo.FindSystemTimeZoneById(tz.Replace('/', '_'));
                return true;
            }
            catch
            {
                return false;
            }
        }
    }

    private static string? InferFromOfficeLabel(string? officeLabel)
    {
        if (string.IsNullOrWhiteSpace(officeLabel)) return null;
        var parts = officeLabel.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 2)
            return InferFromLocation(parts[^1], parts[^2]);
        return InferFromLocation(officeLabel, null);
    }

    private static string? InferFromLocation(string? country, string? state)
    {
        var c = (country ?? "").Trim().ToLowerInvariant();
        var s = (state ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(c)) return null;

        if (c.Contains("australia") || c == "au")
        {
            if (RegexMatch(s, @"(^|\b)(wa|western australia)\b")) return "Australia/Perth";
            if (RegexMatch(s, @"(^|\b)(qld|queensland)\b")) return "Australia/Brisbane";
            if (RegexMatch(s, @"(^|\b)(nt|northern territory)\b")) return "Australia/Darwin";
            if (RegexMatch(s, @"(^|\b)(sa|south australia)\b")) return "Australia/Adelaide";
            return "Australia/Sydney";
        }
        if (c.Contains("united states") || c == "usa" || c == "us")
        {
            if (RegexMatch(s, @"(pacific|ca|california|wa|washington|or|oregon|nv|nevada)")) return "America/Los_Angeles";
            if (RegexMatch(s, @"(mountain|co|colorado|ut|utah|az|arizona|mt|montana)")) return "America/Denver";
            if (RegexMatch(s, @"(central|tx|texas|il|illinois|mn|minnesota|mo|missouri)")) return "America/Chicago";
            return "America/New_York";
        }
        if (c.Contains("united kingdom") || c == "uk" || c.Contains("britain")) return "Europe/London";
        if (c.Contains("south africa")) return "Africa/Johannesburg";
        if (c.Contains("india")) return "Asia/Kolkata";
        if (c.Contains("singapore")) return "Asia/Singapore";
        if (c.Contains("japan")) return "Asia/Tokyo";
        if (c.Contains("new zealand")) return "Pacific/Auckland";

        return null;
    }

    private static bool RegexMatch(string input, string pattern) =>
        System.Text.RegularExpressions.Regex.IsMatch(input, pattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
}
