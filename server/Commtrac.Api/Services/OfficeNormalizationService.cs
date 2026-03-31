using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Services;

public class OfficeNormalizationService
{
    private readonly AppDbContext _db;

    public OfficeNormalizationService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<string> NormalizeOfficeAsync(string? office)
    {
        var offices = await _db.Offices.AsNoTracking().ToListAsync();
        return NormalizeOfficeValue(office, offices);
    }

    public async Task<bool> NormalizeUserOfficeAsync(UserEntity user)
    {
        var normalized = await NormalizeOfficeAsync(user.Office);
        if (normalized == user.Office)
        {
            return false;
        }

        user.Office = normalized;
        return true;
    }

    public async Task<int> NormalizeUserOfficesAsync(IEnumerable<UserEntity> users)
    {
        var offices = await _db.Offices.AsNoTracking().ToListAsync();
        var updated = 0;

        foreach (var user in users)
        {
            var normalized = NormalizeOfficeValue(user.Office, offices);
            if (normalized == user.Office)
            {
                continue;
            }

            user.Office = normalized;
            updated++;
        }

        return updated;
    }

    public static string NormalizeOfficeValue(string? office, IEnumerable<OfficeEntity> offices)
    {
        var value = NormalizeInput(office);
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        if (string.Equals(value, "All", StringComparison.OrdinalIgnoreCase))
        {
            return "All";
        }

        var officeList = offices
            .Where(o => !string.IsNullOrWhiteSpace(o.Country) || !string.IsNullOrWhiteSpace(o.City))
            .ToList();

        if (officeList.Count == 0)
        {
            return value;
        }

        var countries = BuildCountryAliasMap(officeList);
        var exactDisplay = officeList.FirstOrDefault(o =>
            string.Equals(ToDisplay(o), value, StringComparison.OrdinalIgnoreCase));
        if (exactDisplay is not null)
        {
            return ToDisplay(exactDisplay);
        }

        if (TryResolveCountry(value, countries, out var canonicalCountry))
        {
            return canonicalCountry;
        }

        var cityMatches = officeList
            .Where(o => string.Equals(o.City?.Trim(), value, StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (cityMatches.Count == 1)
        {
            return ToDisplay(cityMatches[0]);
        }

        var stateMatches = officeList
            .Where(o => string.Equals(o.State?.Trim(), value, StringComparison.OrdinalIgnoreCase))
            .Select(o => o.Country?.Trim())
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (stateMatches.Count == 1)
        {
            return stateMatches[0]!;
        }

        if (value.Contains(','))
        {
            var segments = value
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(segment => !string.IsNullOrWhiteSpace(segment))
                .ToArray();

            if (segments.Length >= 2)
            {
                var first = segments[0];
                var last = segments[^1];

                if (TryResolveCountry(last, countries, out var parsedCountry))
                {
                    var cityInCountry = officeList.FirstOrDefault(o =>
                        string.Equals(o.City?.Trim(), first, StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(o.Country?.Trim(), parsedCountry, StringComparison.OrdinalIgnoreCase));
                    if (cityInCountry is not null)
                    {
                        return ToDisplay(cityInCountry);
                    }
                }

                var firstCityMatch = officeList.FirstOrDefault(o =>
                    string.Equals(o.City?.Trim(), first, StringComparison.OrdinalIgnoreCase));
                if (firstCityMatch is not null)
                {
                    return ToDisplay(firstCityMatch);
                }
            }
        }

        return value;
    }

    private static string NormalizeInput(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return string.Join(
            ", ",
            value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        ).Trim();
    }

    private static Dictionary<string, string> BuildCountryAliasMap(IEnumerable<OfficeEntity> offices)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var country in offices
                     .Select(o => o.Country?.Trim())
                     .Where(c => !string.IsNullOrWhiteSpace(c))
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            foreach (var alias in GetCountryAliases(country!))
            {
                map[alias] = country!;
            }
        }

        foreach (var alias in GetCountryAliases("Australia"))
        {
            map.TryAdd(alias, "Australia");
        }

        return map;
    }

    private static bool TryResolveCountry(string value, IReadOnlyDictionary<string, string> aliases, out string country)
    {
        var normalized = NormalizeInput(value);
        if (aliases.TryGetValue(normalized, out country!))
        {
            return true;
        }

        if (!normalized.Contains(','))
        {
            country = string.Empty;
            return false;
        }

        var last = normalized.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).LastOrDefault();
        if (!string.IsNullOrWhiteSpace(last) && aliases.TryGetValue(last, out country!))
        {
            return true;
        }

        country = string.Empty;
        return false;
    }

    private static IEnumerable<string> GetCountryAliases(string country)
    {
        var canonical = country.Trim();
        var low = canonical.ToLowerInvariant();

        if (new[] { "usa", "us", "u.s.", "united states", "united states of america" }.Contains(low))
        {
            return new[] { canonical, "USA", "US", "U.S.", "United States", "United States of America" };
        }

        if (new[] { "uk", "u.k.", "united kingdom", "great britain", "britain" }.Contains(low))
        {
            return new[] { canonical, "UK", "U.K.", "United Kingdom", "Great Britain", "Britain" };
        }

        if (new[] { "uae", "u.a.e.", "united arab emirates" }.Contains(low))
        {
            return new[] { canonical, "UAE", "U.A.E.", "United Arab Emirates" };
        }

        return new[] { canonical };
    }

    private static string ToDisplay(OfficeEntity office)
    {
        var city = office.City?.Trim();
        var country = office.Country?.Trim();

        if (!string.IsNullOrWhiteSpace(city) && !string.IsNullOrWhiteSpace(country))
        {
            return $"{city}, {country}";
        }

        return !string.IsNullOrWhiteSpace(country) ? country! : city ?? string.Empty;
    }
}
