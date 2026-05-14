# =============================================
# Prueba de POST /api/v1/valrep/planes/v2
# Servidor NestJS en puerto 3001
# =============================================

$url = "http://localhost:3001/api/v1/valrep/planes/v2"

# --- Caso 1: ramo 6, sin item ni entidad ---
$body = @{
    cramo      = 6
    cproductor = 12345
    ctipo      = 1
    cusuario   = "355"
} | ConvertTo-Json

Write-Host "`n=== CASO 1: base ===" -ForegroundColor Cyan
$response = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json"
$response | ConvertTo-Json -Depth 10

# --- Caso 2: con placa nacional ---
$body2 = @{
    cramo      = 6
    cproductor = 12345
    ctipo      = 1
    cusuario   = "355"
    iplaca     = "B"
} | ConvertTo-Json

Write-Host "`n=== CASO 2: placa nacional ===" -ForegroundColor Cyan
$response2 = Invoke-RestMethod -Uri $url -Method Post -Body $body2 -ContentType "application/json"
$response2 | ConvertTo-Json -Depth 10

# --- Caso 3: validacion (body incompleto) → espera 400 ---
$body3 = @{
    cproductor = 12345
} | ConvertTo-Json

Write-Host "`n=== CASO 3: validacion 400 ===" -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri $url -Method Post -Body $body3 -ContentType "application/json" -ErrorAction Stop
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "HTTP $statusCode (esperado 400)" -ForegroundColor Green
    $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 5
}
