using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Commtrac.Api.Migrations
{
    /// <inheritdoc />
    public partial class RemoveUserIdField : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Remove any custom "User ID" field definition scoped to the users table.
            // This field was not seeded — it was added at runtime via the admin panel.
            migrationBuilder.Sql(@"
                DELETE FROM FieldDefinitions
                WHERE Name = 'User ID'
                  AND TablesJson LIKE '%""users""%';
            ");

            // Also clean up any orphaned field values for those definitions
            migrationBuilder.Sql(@"
                DELETE FROM FieldValues
                WHERE TableName = 'users'
                  AND FieldDefinitionId NOT IN (
                      SELECT Id FROM FieldDefinitions
                  );
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // No rollback — this removes a user-created field definition.
        }
    }
}
