# setup-labels.ps1
# Crea las etiquetas profesionales en el repo de GitHub via API REST
# Uso: .\setup-labels.ps1 -Token "ghp_xxxxxxxxxxxx"
# El token necesita permiso: repo (o public_repo si el repo es publico)

param(
    [Parameter(Mandatory=$true)]
    [string]$Token
)

$repo  = "jsotoexelixitech/server-api-sys"
$base  = "https://api.github.com/repos/$repo/labels"
$heads = @{ Authorization = "Bearer $Token"; Accept = "application/vnd.github+json"; "X-GitHub-Api-Version" = "2022-11-28" }

$labels = @(
    @{ name="bug";             color="d73a4a"; description="Comportamiento incorrecto o error inesperado" },
    @{ name="enhancement";     color="a2eeef"; description="Nueva funcionalidad o mejora" },
    @{ name="migration";       color="0075ca"; description="Migracion de endpoint desde Express a NestJS" },
    @{ name="security";        color="e4e669"; description="Vulnerabilidad o mejora de seguridad" },
    @{ name="documentation";   color="1d76db"; description="Mejoras o correcciones en la documentacion" },
    @{ name="performance";     color="fbca04"; description="Optimizacion de rendimiento" },
    @{ name="refactor";        color="d4c5f9"; description="Refactorizacion sin cambio de comportamiento" },
    @{ name="breaking-change"; color="b60205"; description="Cambio incompatible con versiones anteriores" },
    @{ name="needs-triage";    color="ededed"; description="Pendiente de revision y clasificacion" },
    @{ name="in-progress";     color="0e8a16"; description="Trabajo en curso" },
    @{ name="blocked";         color="e11d48"; description="Bloqueado esperando algo externo" },
    @{ name="database";        color="c2e0c6"; description="SQL Server / stored procedures" },
    @{ name="swagger";         color="85e89d"; description="Documentacion Swagger / DTOs" },
    @{ name="ci/cd";           color="bfd4f2"; description="GitHub Actions / PM2 / deploy" },
    @{ name="dependencies";    color="0075ca"; description="Actualizaciones de paquetes npm" },
    @{ name="question";        color="d876e3"; description="Consulta o duda sobre el proyecto" }
)

# Borrar etiquetas default que no usamos
$defaults = @("duplicate","good first issue","help wanted","invalid","question","wontfix")
foreach ($d in $defaults) {
    try {
        Invoke-RestMethod -Uri "$base/$d" -Method Delete -Headers $heads -ErrorAction SilentlyContinue | Out-Null
    } catch {}
}

$ok = 0; $skip = 0
foreach ($l in $labels) {
    $body = $l | ConvertTo-Json
    try {
        Invoke-RestMethod -Uri $base -Method Post -Headers $heads -Body $body -ContentType "application/json" | Out-Null
        Write-Host "  [+] $($l.name)"
        $ok++
    } catch {
        # Intentar actualizar si ya existe (PATCH)
        try {
            Invoke-RestMethod -Uri "$base/$([Uri]::EscapeDataString($l.name))" -Method Patch -Headers $heads -Body $body -ContentType "application/json" | Out-Null
            Write-Host "  [~] $($l.name) (actualizada)"
            $skip++
        } catch {
            Write-Host "  [x] $($l.name): $($_.ErrorDetails.Message)"
        }
    }
}

Write-Host ""
Write-Host "Etiquetas creadas: $ok  |  Actualizadas: $skip"
Write-Host "Ver en: https://github.com/$repo/labels"
