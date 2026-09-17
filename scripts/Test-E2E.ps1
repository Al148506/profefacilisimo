# Uses a disposable PostgreSQL database and a dedicated API port; never seeds the development database.
. "$PSScriptRoot/Common.ps1"
$settings = Read-LocalSettings
$database = 'pf_e2e_' + [Guid]::NewGuid().ToString('N')
$api = $null
$created = $false
try {
    Invoke-Checked docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh $database
    $created = $true
    $env:ConnectionStrings__Default = $settings.ConnectionString + ";Database=$database"
    $env:API_PROXY_TARGET = 'http://localhost:5081'
    Invoke-Checked dotnet ef database update --project backend/Infrastructure --startup-project backend/Api
    $start = @{
        FilePath = (Get-Command dotnet).Source
        ArgumentList = @('run', '--project', 'backend/Api', '--no-build', '--no-launch-profile', '--urls', 'http://localhost:5081')
        WorkingDirectory = $Root
        PassThru = $true
        RedirectStandardOutput = "$Root/.tools/e2e-api.log"
        RedirectStandardError = "$Root/.tools/e2e-api-error.log"
    }
    if ($IsWindows) { $start.WindowStyle = 'Hidden' }
    $api = Start-Process @start
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        if ($api.HasExited) { throw 'E2E API exited. Inspect .tools/e2e-api-error.log.' }
        try {
            $response = Invoke-WebRequest 'http://localhost:5081/health/ready' -TimeoutSec 10
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { Start-Sleep -Seconds 1 }
    }
    if (!$ready) { throw 'E2E API did not become ready.' }
    Invoke-Checked npm --prefix frontend run test:e2e
} finally {
    if ($api -and !$api.HasExited) { $api.Kill($true); $api.WaitForExit() }
    if ($created) { Invoke-Checked docker compose exec -T postgres sh -c 'dropdb --if-exists --force -U "$POSTGRES_USER" "$1"' sh $database }
    $env:API_PROXY_TARGET = $null
    $env:ConnectionStrings__Default = $settings.ConnectionString
}


