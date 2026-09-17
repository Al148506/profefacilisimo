. "$PSScriptRoot/Common.ps1"
New-Item -ItemType Directory -Force .tools | Out-Null
if (!(Test-Path .env)) {
    $password = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    "POSTGRES_DB=profefacilisimo`nPOSTGRES_USER=profefacilisimo`nPOSTGRES_PASSWORD=$password`nPOSTGRES_PORT=5432" | Set-Content .env
}
if (!(Test-Path .tools/local-settings.json)) {
    $values = @{}
    Get-Content .env | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { $values[$matches[1]] = $matches[2] } }
    $port = if ($values.POSTGRES_PORT) { $values.POSTGRES_PORT } else { '5432' }
    # Quote connection string values so an existing local password can contain semicolons.
    $db = $values.POSTGRES_DB.Replace('"', '""')
    $user = $values.POSTGRES_USER.Replace('"', '""')
    $password = $values.POSTGRES_PASSWORD.Replace('"', '""')
    @{
        ConnectionString = "Host=localhost;Port=$port;Database=`"$db`";Username=`"$user`";Password=`"$password`""
        SigningKey = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
    } | ConvertTo-Json | Set-Content .tools/local-settings.json
}
$null = Read-LocalSettings
Invoke-Checked docker compose up -d --wait
Invoke-Checked dotnet restore Profefacilisimo.slnx
Invoke-Checked dotnet tool restore
Invoke-Checked dotnet ef database update --project backend/Infrastructure --startup-project backend/Api
Invoke-Checked npm --prefix frontend ci
Write-Host 'Setup complete. Run scripts/Start-Api.ps1 and npm --prefix frontend run dev in separate terminals.'
