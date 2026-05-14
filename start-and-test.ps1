# =========================================================
# SysIP NestJS — Arranque y prueba en un solo comando
# Ejecutar desde: backend-api-sys\nest-api\
# =========================================================

Set-Location $PSScriptRoot

Write-Host "`n[1/3] Instalando dependencias..." -ForegroundColor Cyan
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: npm install falló" -ForegroundColor Red; exit 1 }

Write-Host "`n[2/3] Levantando servidor NestJS en puerto 3001..." -ForegroundColor Cyan
$server = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c","npm","run","start:dev" `
    -PassThru -NoNewWindow `
    -RedirectStandardOutput "$PSScriptRoot\server.log" `
    -RedirectStandardError  "$PSScriptRoot\server-error.log"

Write-Host "    Esperando que el servidor arranque (15 seg)..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path "$PSScriptRoot\server.log") {
        $log = Get-Content "$PSScriptRoot\server.log" -Raw -ErrorAction SilentlyContinue
        if ($log -match "listening on port") {
            $ready = $true
            break
        }
    }
}

if (-not $ready) {
    Write-Host "`n  El servidor tardó más de lo esperado. Revisando logs..." -ForegroundColor Yellow
    Get-Content "$PSScriptRoot\server.log" -ErrorAction SilentlyContinue | Select-Object -Last 10
    Get-Content "$PSScriptRoot\server-error.log" -ErrorAction SilentlyContinue | Select-Object -Last 5
}

Write-Host "`n[3/3] Probando POST /api/v1/valrep/planes/v2 ..." -ForegroundColor Cyan

$url  = "http://localhost:3001/api/v1/valrep/planes/v2"
$body = @{
    cramo      = 6
    cproductor = 12345
    ctipo      = 1
    cusuario   = "355"
} | ConvertTo-Json

try {
    $resp = Invoke-RestMethod -Uri $url -Method Post -Body $body `
        -ContentType "application/json" -TimeoutSec 30 -ErrorAction Stop
    Write-Host "`n OK — HTTP 200" -ForegroundColor Green
    $resp | ConvertTo-Json -Depth 10
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "`n ERROR — HTTP $code" -ForegroundColor Red
    Write-Host $_.ErrorDetails.Message
    Write-Host "`nLogs del servidor:" -ForegroundColor Yellow
    Get-Content "$PSScriptRoot\server.log" | Select-Object -Last 20
}

Write-Host "`nSwagger disponible en: http://localhost:3001/docs" -ForegroundColor DarkCyan
Write-Host "Para detener el servidor: Stop-Process -Id $($server.Id)" -ForegroundColor Gray
