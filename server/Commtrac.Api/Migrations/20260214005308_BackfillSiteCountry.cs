using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class BackfillSiteCountry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var sites = MigrationSql.Q("Sites");
            var offices = MigrationSql.Q("Offices");

            // If older data used State as "State/Country", move country-like values into Country.
            // 1) If State equals a known office country, treat it as a country.
            migrationBuilder.Sql($@"
                UPDATE {sites}
                SET ""Country"" = ""State"", ""State"" = NULL
                WHERE (""Country"" IS NULL OR ""Country"" = '')
                  AND ""State"" IS NOT NULL AND TRIM(""State"") <> ''
                  AND TRIM(""State"") IN (SELECT DISTINCT ""Country"" FROM {offices});
            ");

            // 2) Australia state abbreviations/names => Australia.
            migrationBuilder.Sql($@"
                UPDATE {sites}
                SET ""Country"" = 'Australia'
                WHERE (""Country"" IS NULL OR ""Country"" = '')
                  AND ""State"" IS NOT NULL AND TRIM(""State"") <> ''
                  AND TRIM(""State"") IN (
                    'NSW','New South Wales',
                    'VIC','Victoria',
                    'QLD','Queensland',
                    'WA','Western Australia',
                    'SA','South Australia',
                    'TAS','Tasmania',
                    'ACT','Australian Capital Territory',
                    'NT','Northern Territory'
                  );
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // No safe down-migration for data backfill.
        }
    }
}
