# Current Database Schema (Derived from Code)

Source of truth: `server/Commtrac.Api/Migrations/AppDbContextModelSnapshot.cs`, `server/Commtrac.Api/Data/AppDbContext.cs`, `server/Commtrac.Api/Models/Entities.cs`.

## Summary
- Total tables: 25
- Explicit database foreign keys: 0
- Inferred application-level relationships: 15
- Note: relationships are mostly application-enforced (indexed ID columns) rather than DB-enforced FK constraints.

## Table Structures
### AdminTabRows
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| DataJson | TEXT | string | False |  |  | False |  |
| Position | INTEGER | int | False |  |  | False |  |
| TabId | TEXT | string | False |  | 80 | False | AdminTabs.Id (INFERRED) |

### AdminTabs
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| ColumnsJson | TEXT | string | False |  |  | False |  |
| ConfigJson | TEXT | string | False |  |  | False |  |
| FieldIdsJson | TEXT | string | False |  |  | False |  |
| Label | TEXT | string | False |  | 120 | False |  |
| Position | INTEGER | int | False |  |  | False |  |
| PrimaryActionLabel | TEXT | string | True |  | 120 | False |  |
| Type | TEXT | string | False |  | 40 | False |  |

### Assets
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| Comments | TEXT | string | False |  | 800 | False |  |
| MachineId | TEXT | string | False |  | 200 | False |  |
| MachineType | TEXT | string | False |  | 200 | False |  |
| PmCount | TEXT | string | False |  | 80 | False |  |
| Seq | INTEGER | int | False |  |  | False |  |
| SerialNumber | TEXT | string | False |  | 200 | False |  |

### AuditLogs
- Primary key: `Id`
- Indexes: (Timestamp); (UserId)

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| Action | TEXT | string | False |  | 80 | False |  |
| Details | TEXT | string | True |  | 500 | False |  |
| IpAddress | TEXT | string | True |  | 80 | False |  |
| Timestamp | TEXT | DateTime | False |  |  | False |  |
| UserEmail | TEXT | string | False |  | 200 | False |  |
| UserId | TEXT | string | False |  | 80 | False | Users.Id (INFERRED) |

### Customers
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| CustomerId | TEXT | string | False |  | 80 | False |  |
| Industry | TEXT | string | True |  | 100 | False |  |
| Logo | TEXT | string | True |  | 1000 | False |  |
| LogoShape | TEXT | string | False |  | 40 | False |  |
| LogoSize | INTEGER | int | False |  |  | False |  |
| Name | TEXT | string | False |  | 200 | False |  |
| Office | TEXT | string | False |  | 40 | False |  |
| PhotoScale | INTEGER | int | False |  |  | False |  |

### CustomFieldDefinitions
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| FieldType | TEXT | string | False |  | 40 | False |  |
| IsActive | INTEGER | bool | False |  |  | False |  |
| Name | TEXT | string | False |  | 200 | False |  |
| OptionsJson | TEXT | string | False | "[]" |  | False |  |
| Product | TEXT | string | True |  | 200 | False |  |
| Scope | TEXT | string | False |  | 40 | False |  |
| SortOrder | INTEGER | int | False |  |  | False |  |

### Documents
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| ContentType | TEXT | string | True |  | 120 | False |  |
| FilePath | TEXT | string | True |  | 400 | False |  |
| FileSize | INTEGER | long? | True |  |  | False |  |
| LinkedTo | TEXT | string | False |  | 200 | False |  |
| Name | TEXT | string | False |  | 200 | False |  |
| Type | TEXT | string | False |  | 80 | False |  |
| UploadedAt | TEXT | string | False |  | 40 | False |  |

### FieldDefinitions
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| ActionType | TEXT | string | True |  | 80 | False |  |
| FieldType | TEXT | string | False |  | 40 | False |  |
| IsActive | INTEGER | bool | False |  |  | False |  |
| LinkToFieldId | TEXT | string | True |  | 120 | False |  |
| Name | TEXT | string | False |  | 120 | False |  |
| SortOrder | INTEGER | int | False |  |  | False |  |
| TablesJson | TEXT | string | False |  | 400 | False |  |

### FieldValues
- Primary key: `Id`
- Indexes: (FieldDefinitionId); (TableName, EntityId)

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| EntityId | TEXT | string | False |  | 80 | False |  |
| FieldDefinitionId | TEXT | string | False |  | 80 | False | FieldDefinitions.Id (INFERRED) |
| TableName | TEXT | string | False |  | 40 | False |  |
| UpdatedAt | TEXT | string | False |  | 40 | False |  |
| Value | TEXT | string | False |  | 2000 | False |  |

### InspectionPhotos
- Primary key: `Id`
- Indexes: (InspectionId)

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| ContentType | TEXT | string | True |  | 120 | False |  |
| FileName | TEXT | string | False |  | 200 | False |  |
| FilePath | TEXT | string | False |  | 400 | False |  |
| FileSize | INTEGER | long? | True |  |  | False |  |
| InspectionId | TEXT | string | False |  | 80 | False | Inspections.Id (INFERRED) |
| UploadedAt | TEXT | string | False |  | 40 | False |  |

### Inspections
- Primary key: `Id`
- Indexes: (InstallationId)

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| Inspector | TEXT | string | False |  | 200 | False |  |
| InstallationId | TEXT | string | False |  | 80 | False | Installations.Id (INFERRED) |
| Name | TEXT | string | False |  | 200 | False |  |
| PhotoCount | INTEGER | int | False |  |  | False |  |
| ScheduledDate | TEXT | string | True |  | 40 | False |  |
| Status | TEXT | string | False |  | 40 | False |  |

### Installations
- Primary key: `Id`
- Indexes: (ProjectId)

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| ActualFinish | TEXT | string | True |  | 40 | False |  |
| ActualStart | TEXT | string | True |  | 40 | False |  |
| AssignedTeam | TEXT | string | False |  | 200 | False |  |
| AssignedUsers | TEXT | string | False |  |  | False | Users.Id (INFERRED) |
| CustomFieldsJson | TEXT | string | False | "{}" |  | False |  |
| CustomerSignOffContact | TEXT | string | True |  | 200 | False |  |
| CustomerSignOffDate | TEXT | string | True |  | 40 | False |  |
| InstallationId | TEXT | string | True |  | 80 | False |  |
| InstallationName | TEXT | string | True |  | 200 | False |  |
| InstallationNumber | TEXT | string | False |  | 80 | False |  |
| InstallerNotes | TEXT | string | True |  | 800 | False |  |
| MachineType | TEXT | string | True |  | 200 | False |  |
| Office | TEXT | string | False |  | 40 | False |  |
| Pm1Serial | TEXT | string | True |  | 200 | False |  |
| Pm2Serial | TEXT | string | True |  | 200 | False |  |
| Pm3Serial | TEXT | string | True |  | 200 | False |  |
| Pm4Serial | TEXT | string | True |  | 200 | False |  |
| ProjectId | TEXT | string | False |  | 80 | False | Projects.Id (INFERRED) |
| ScheduledEnd | TEXT | string | False |  | 40 | False |  |
| ScheduledStart | TEXT | string | False |  | 40 | False |  |
| SiteContactEmail | TEXT | string | True |  | 200 | False |  |
| SiteContactName | TEXT | string | True |  | 200 | False |  |
| SiteContactPhone | TEXT | string | True |  | 80 | False |  |
| SiteLocation | TEXT | string | False |  | 200 | False |  |
| Status | TEXT | string | False |  | 40 | False |  |

### InstallationTabRows
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| DataJson | TEXT | string | False |  |  | False |  |
| Position | INTEGER | int | False |  |  | False |  |
| TabId | TEXT | string | False |  | 80 | False | InstallationTabs.Id (INFERRED) |

### InstallationTabs
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| Label | TEXT | string | False |  | 120 | False |  |
| Position | INTEGER | int | False |  |  | False |  |
| Type | TEXT | string | False |  | 40 | False |  |

### Issues
- Primary key: `Id`
- Indexes: (InstallationId)

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| Description | TEXT | string | True |  | 800 | False |  |
| InstallationId | TEXT | string | False |  | 80 | False | Installations.Id (INFERRED) |
| Owner | TEXT | string | False |  | 200 | False |  |
| Priority | TEXT | string | False |  | 40 | False |  |
| Status | TEXT | string | False |  | 40 | False |  |
| Title | TEXT | string | False |  | 200 | False |  |

### NotificationSettings
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | INTEGER | int | False |  |  | True |  |
| FrontendBaseUrl | TEXT | string | False |  | 300 | False |  |
| SmsApiKey | TEXT | string | False |  | 200 | False |  |
| SmsProvider | TEXT | string | False |  | 80 | False |  |
| SmsSender | TEXT | string | False |  | 80 | False |  |
| SmtpFrom | TEXT | string | False |  | 200 | False |  |
| SmtpHost | TEXT | string | False |  | 200 | False |  |
| SmtpPass | TEXT | string | False |  | 500 | False |  |
| SmtpPort | INTEGER | int | False |  |  | False |  |
| SmtpUseSsl | INTEGER | bool | False |  |  | False |  |
| SmtpUser | TEXT | string | False |  | 200 | False |  |

### Offices
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| City | TEXT | string | False |  | 100 | False |  |
| Country | TEXT | string | False |  | 100 | False |  |
| Lat | REAL | double | False |  |  | False |  |
| Lng | REAL | double | False |  |  | False |  |
| State | TEXT | string | False |  | 100 | False |  |

### Products
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| Description | TEXT | string | True |  | 500 | False |  |
| FeaturesJson | TEXT | string | False | "[]" |  | False |  |
| Name | TEXT | string | False |  | 200 | False |  |

### Projects
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| ApprovalDecision | TEXT | string | True |  | 80 | False |  |
| ContractValue | TEXT | decimal? | True |  |  | False |  |
| CustomerId | TEXT | string | False |  | 80 | False | Customers.Id (INFERRED) |
| CustomerName | TEXT | string | False |  | 200 | False |  |
| Description | TEXT | string | False |  | 800 | False |  |
| FinishDate | TEXT | string | False |  | 40 | False |  |
| InstallationMode | TEXT | string | True |  | 80 | False |  |
| IsInstallationProject | INTEGER | bool | False |  |  | False |  |
| JobNumber | TEXT | string | False |  | 80 | False |  |
| Office | TEXT | string | False |  | 40 | False |  |
| ProbabilityStage | TEXT | string | True |  | 120 | False |  |
| ProductFeatureValuesJson | TEXT | string | False | "{}" |  | False |  |
| ProductIds | TEXT | string | False |  |  | False | Products.Id (INFERRED) |
| ProjectManager | TEXT | string | True |  | 200 | False | Users.FullName (INFERRED) |
| ProjectType | TEXT | string | False |  | 40 | False |  |
| Region | TEXT | string | True |  | 120 | False |  |
| SiteId | TEXT | string | True |  | 80 | False | Sites.Id (INFERRED) |
| StartDate | TEXT | string | False |  | 40 | False |  |
| Status | TEXT | string | False |  | 40 | False |  |

### QuickbaseSettings
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | INTEGER | int | False |  |  | True |  |
| Enabled | INTEGER | bool | False |  |  | False |  |
| InstallationsFieldMapJson | TEXT | string | False | "{}" |  | False |  |
| InstallationsTableId | TEXT | string | False |  | 80 | False |  |
| ProjectsFieldMapJson | TEXT | string | False | "{}" |  | False |  |
| ProjectsTableId | TEXT | string | False |  | 80 | False |  |
| RealmHostname | TEXT | string | False |  | 200 | False |  |
| UserToken | TEXT | string | False |  | 200 | False |  |

### RoleConfigs
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | INTEGER | int | False |  |  | True |  |
| ConfigJson | TEXT | string | False |  |  | False |  |

### Sessions
- Primary key: `Id`
- Indexes: (UserId)

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| CreatedAt | TEXT | DateTime | False |  |  | False |  |
| IpAddress | TEXT | string | True |  | 80 | False |  |
| IsRevoked | INTEGER | bool | False |  |  | False |  |
| LastActiveAt | TEXT | DateTime | False |  |  | False |  |
| UserAgent | TEXT | string | True |  | 500 | False |  |
| UserEmail | TEXT | string | False |  | 200 | False |  |
| UserId | TEXT | string | False |  | 80 | False | Users.Id (INFERRED) |

### Sites
- Primary key: `Id`
- Indexes: (CustomerId)

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| Address | TEXT | string | True |  | 500 | False |  |
| City | TEXT | string | True |  | 100 | False |  |
| ContactEmail | TEXT | string | True |  | 200 | False |  |
| ContactName | TEXT | string | True |  | 200 | False |  |
| ContactPhone | TEXT | string | True |  | 80 | False |  |
| Country | TEXT | string | True |  | 100 | False |  |
| CreatedAt | TEXT | DateTime | False |  |  | False |  |
| CustomerId | TEXT | string | False |  | 80 | False | Customers.Id (INFERRED) |
| Name | TEXT | string | False |  | 200 | False |  |
| Notes | TEXT | string | True |  | 800 | False |  |
| State | TEXT | string | True |  | 40 | False |  |
| ZipCode | TEXT | string | True |  | 20 | False |  |

### TableConfigs
- Primary key: `Id`
- Indexes: (TableName) [UNIQUE]

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | INTEGER | int | False |  |  | True |  |
| BaseFieldMetaJson | TEXT | string | False | "{}" |  | False |  |
| BaseFieldNamesJson | TEXT | string | False | "{}" |  | False |  |
| HiddenJson | TEXT | string | False | "[]" |  | False |  |
| OrderJson | TEXT | string | False | "[]" |  | False |  |
| TableName | TEXT | string | False |  |  | False |  |

### Users
- Primary key: `Id`
- Indexes: none

| Column | DB Type | CLR Type | Nullable | Default | Max Length | PK | FK |
|---|---|---|---|---|---|---|---|
| Id | TEXT | string | False |  |  | True |  |
| Email | TEXT | string | False |  | 200 | False |  |
| FullName | TEXT | string | False |  | 200 | False |  |
| Is2faEnabled | INTEGER | bool | False |  |  | False |  |
| IsActive | INTEGER | bool | False |  |  | False |  |
| IsFirstLogin | INTEGER | bool | False |  |  | False |  |
| Office | TEXT | string | False |  | 40 | False |  |
| PasswordChangedAt | TEXT | DateTime? | True |  |  | False |  |
| PasswordHash | TEXT | string | False |  | 200 | False |  |
| RecoveryCodesJson | TEXT | string | True |  |  | False |  |
| ResetToken | TEXT | string | True |  | 200 | False |  |
| ResetTokenExpiresUtc | TEXT | DateTime? | True |  |  | False |  |
| Role | TEXT | string | False |  | 80 | False |  |
| TotpSecret | TEXT | string | True |  | 200 | False |  |

## Reference Map
### Projects
- `Projects.CustomerId` -> `Customers.Id` (INFERRED, N:1)
- `Projects.SiteId` -> `Sites.Id` (INFERRED, optional N:1)
- `Projects.ProductIds` -> `Products.Id` (INFERRED, N:N via JSON array in a single column)
- `Projects.ProjectManager` -> `Users.FullName` (INFERRED weak reference; free text, not ID)
- `Projects.Office` is a string label and not a DB FK to `Offices`.
- `Projects.JobNumber` is a business identifier but currently not PK and not unique constrained.

### Installations
- `Installations.ProjectId` -> `Projects.Id` (INFERRED, N:1)
- `Installations.AssignedUsers` -> `Users.Id` (INFERRED, N:N via JSON array in a single column)
- `Installations` uses direct component-style serial columns (`Pm1Serial`..`Pm4Serial`) and `MachineType`; there is no `InstallationComponents` child table in current schema.
- `Inspections.InstallationId` -> `Installations.Id` (INFERRED, N:1)
- `Issues.InstallationId` -> `Installations.Id` (INFERRED, N:1)
- `InspectionPhotos.InspectionId` -> `Inspections.Id` (INFERRED, N:1)

### Admin / Builder Permissions (Role Config)
- Permission flags exist in role config JSON (table `RoleConfigs`, column `ConfigJson`) and frontend type `RolePermissions`:
- `viewOnly`, `createDeleteTables`, `createUsers`, `editFields`, `modifyData`, `editForms`
- These are persisted as JSON and are not normalized into separate permission rows.

### Domain Coverage Check
- Present admin tables: `Users`, `RoleConfigs` (for Roles permissions), `Customers`, `Offices` (Global Offices), `Products`.
- Present operational table: `Projects`.
- Present execution tables: `Installations`, `Inspections`, `InspectionPhotos`, `Issues`, `Documents`.
- Not present as dedicated tables (in current schema): `Workflows`, `FormTemplates`, `FormInstances`, `InstallationComponents`.

## Normalization Opportunities
- Add explicit FK constraints for all inferred ID references to enforce referential integrity in DB.
- Replace JSON array columns (`Projects.ProductIds`, `Installations.AssignedUsers`) with junction tables.
- Replace text weak reference `Projects.ProjectManager` with `ProjectManagerUserId` FK to `Users.Id`.
- Consider normalized child table for installation components instead of fixed `Pm1Serial`..`Pm4Serial` columns if component count varies.
- Add unique constraints for business keys if required (for example `Projects.JobNumber`, `Customers.CustomerId`).
