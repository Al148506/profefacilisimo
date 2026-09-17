. "$PSScriptRoot/Common.ps1"
$settings = Read-LocalSettings
$env:TEST_DATABASE_CONNECTION = $settings.ConnectionString
Invoke-Checked dotnet test Profefacilisimo.slnx
Invoke-Checked npm --prefix frontend run lint
Invoke-Checked npm --prefix frontend run build
Invoke-Checked npm --prefix frontend test
