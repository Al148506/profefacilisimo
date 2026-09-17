. "$PSScriptRoot/Common.ps1"
$null = Read-LocalSettings
Invoke-Checked dotnet run --project backend/Api --no-launch-profile --urls http://localhost:5080
