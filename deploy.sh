#!/usr/bin/env bash
# deploy.sh — instala, compila y levanta con PM2
# Uso desde la carpeta nest-api/:
#   bash deploy.sh              # srv001 (120) desarrollo → --env development
#   bash deploy.sh qa           # srv001qa (121) QA → --env qa
#   bash deploy.sh production   # alias legacy → --env production (= development)
#
# IMPORTANTE: tras git pull SIEMPRE ejecutar npm install antes de build.
# Si solo haces `npm run build` sin install, fallará con "Cannot find module 'nodemailer'".
#
# Primera vez:    instala + compila + start con PM2
# Actualizaciones: instala + compila + restart (cero downtime entre reinicios)
# ─────────────────────────────────────────────────────────────────────────────

set -e  # salir si cualquier comando falla

APP="sysip-nest-api"
LOG_DIR="./logs"
PM2_ENV="${1:-development}"
case "$PM2_ENV" in
  qa|development|production) ;;
  *)
    echo "Entorno PM2 inválido: $PM2_ENV (usar: qa | development | production)"
    exit 1
    ;;
esac

# Quitar archivos/carpetas no rastreados (alinea working tree tras git pull)
if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "▶ git clean (untracked)..."
  git clean -fd --exclude=.env --exclude=logs
fi

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

echo "▶ prisma generate..."
npm run prisma:generate

# 3. Compilar SDK partner + TypeScript → dist/
echo "▶ npm run build:all..."
npm run build:all

# 4. Iniciar o reiniciar con PM2
echo "▶ pm2..."
if pm2 describe "$APP" > /dev/null 2>&1; then
  echo "  proceso existente encontrado → reiniciando (--env $PM2_ENV)"
  pm2 restart ecosystem.config.js --env "$PM2_ENV" --update-env
else
  echo "  primera ejecución → iniciando (--env $PM2_ENV)"
  pm2 start ecosystem.config.js --env "$PM2_ENV"
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
