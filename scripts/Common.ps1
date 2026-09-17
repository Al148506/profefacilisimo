$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root
# No named parameters: native flags such as sh -c must not bind to a PowerShell -Command parameter.
function Invoke-Checked {
    $command = $args[0]
    $arguments = @($args | Select-Object -Skip 1)
    & $command @arguments
    if ($LASTEXITCODE -ne 0) { throw "$command failed with exit code $LASTEXITCODE" }
}
function Read-LocalSettings {
    $file = Join-Path $Root '.tools/local-settings.json'
    if (!(Test-Path $file)) { throw 'Run scripts/Setup.ps1 first.' }
    $settings = Get-Content $file -Raw | ConvertFrom-Json
    $env:ConnectionStrings__Default = $settings.ConnectionString
    $env:Jwt__SigningKey = $settings.SigningKey
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    return $settings
}

