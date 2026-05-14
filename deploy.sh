#!/usr/bin/env bash
# deploy.sh — instala, compila y levanta con PM2
# Uso desde la carpeta nest-api/:
#   bash deploy.sh
#
# Primera vez:    instala + compila + start con PM2
# Actualizaciones: instala + compila + restart (cero downtime entre reinicios)
# ─────────────────────────────────────────────────────────────────────────────

set -e  # salir si cualquier comando falla

APP="sysip-nest-api"
LOG_DIR="./logs"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      SysIP NestJS API — Deploy           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1. Crear carpeta de logs si no existe
mkdir -p "$LOG_DIR"

# 2. Instalar dependencias (devDeps necesarios para compilar)
echo "▶ npm install..."
npm install --prefer-offline

# 3. Compilar TypeScript → dist/
echo "▶ npm run build..."
npm run build

# 4. Iniciar o reiniciar con PM2
echo "▶ pm2..."
if pm2 describe "$APP" > /dev/null 2>&1; then
  echo "  proceso existente encontrado → reiniciando"
  pm2 restart ecosystem.config.js --env production --update-env
else
  echo "  primera ejecución → iniciando"
  pm2 start ecosystem.config.js --env production
fi

# 5. Guardar lista de procesos para que PM2 los restaure al reiniciar el servidor
pm2 save

echo ""
echo "✔  $APP levantado. Comandos útiles:"
echo "   pm2 logs $APP          → ver logs en tiempo real"
echo "   pm2 monit              → monitor interactivo"
echo "   pm2 status             → estado de todos los procesos"
echo "   pm2 restart $APP       → reiniciar sin downtime"
echo "   pm2 stop $APP          → detener"
echo ""
echo "   Para que PM2 arranque solo al reiniciar el servidor:"
echo "   pm2 startup  (ejecuta el comando que te indique)"
echo ""
