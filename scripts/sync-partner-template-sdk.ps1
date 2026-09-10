# Copia nest-api-sdk compilado dentro de la plantilla partner (sin GitHub Packages).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$sdkSrc = Join-Path $root 'packages\nest-api-sdk'
$vendor = Join-Path $root 'docs\partner\partner-api-starter-template\vendor\nest-api-sdk'

Push-Location (Join-Path $sdkSrc)
npm run build
Pop-Location

if (Test-Path $vendor) { Remove-Item $vendor -Recurse -Force }
New-Item -ItemType Directory -Path $vendor -Force | Out-Null
Copy-Item (Join-Path $sdkSrc 'dist') (Join-Path $vendor 'dist') -Recurse
Copy-Item (Join-Path $sdkSrc 'package.json') (Join-Path $vendor 'package.json')
Copy-Item (Join-Path $sdkSrc 'README.md') (Join-Path $vendor 'README.md')
Write-Host "SDK copiado a $vendor"
