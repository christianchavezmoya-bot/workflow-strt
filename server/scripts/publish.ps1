param(
  [string]$Configuration = "Release",
  [string]$Output = "..\\publish"
)

$projectPath = Join-Path $PSScriptRoot "..\\Commtrac.Api\\Commtrac.Api.csproj"

dotnet publish $projectPath -c $Configuration -o $Output
