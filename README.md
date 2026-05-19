# workflow-strt

## Project Workflow Mode

Projects now declare a workflow mode in Project Edit:

- `INSTALLATION_ONLY`
- `INSPECTION_ONLY`
- `MIXED`

Behavior:

- `INSTALLATION_ONLY` keeps the existing installation asset flow unchanged.
- `INSPECTION_ONLY` exposes project inspection tabs and hides installation-only project detail actions.
- `MIXED` exposes both installation and inspection views on the same project.

## Inspection Imports

Third-party inspection JSON can now be uploaded into a project inbox.

API endpoints:

- `POST /api/inspection-imports`
- `GET /api/projects/{projectId}/inspection-imports`
- `POST /api/inspection-imports/{id}/assign`

Frontend usage:

- Open a project with `INSPECTION_ONLY` or `MIXED`
- Go to `Inspection Inbox`
- Paste or upload the raw JSON
- Assign the import to a project asset when needed

## Internal Inspection Runs

Internal inspections use the existing workflow-run engine through project assets.

API endpoints:

- `POST /api/projects/{projectId}/assets/{projectAssetId}/inspections/runs`
- `GET /api/projects/{projectId}/assets/{projectAssetId}/inspections/runs`

Frontend usage:

- Open a project with inspection enabled
- Open `Inspections`
- Open an asset inspection page
- Choose a published inspection workflow template
- Click `Create Inspection`

## Migration

Apply the generated EF migration:

```powershell
dotnet ef database update --project server/Commtrac.Api/Commtrac.Api.csproj
```
