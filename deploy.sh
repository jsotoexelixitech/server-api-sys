#!/usr/bin/env bash
# deploy.sh — instala, compila y levanta con PM2
# Uso desde la carpeta nest-api/:
#   bash deploy.sh              # srv001 (120) desarrollo → --env development
#   bash deploy.sh qa           # srv001qa (121) QA → --env qa
#   bash deploy.sh production   # alias legacy → --env production (= development)
#
# deploy.sh hace el git pull (--ff-only) de la rama actual; SKIP_PULL=1 lo omite.
# Si el servidor tiene paquetes de partners instalados (package.json modificado),
# los guarda, actualiza y los reinstala solo (scripts/install-partner-packages.sh).
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

# 0. Partners + git pull.
# install-partner-packages.sh agrega paquetes a package.json/package-lock.json en el
# servidor; eso bloqueaba el git pull. Se guardan, se actualiza y se reinstalan (paso 2b).
TOKENS_FILE="${NEST_PARTNER_TOKENS_FILE:-$HOME/.config/exelixi-nest-partners/tokens.env}"
PARTNER_SPECS=()
PARTNER_STASH_MSG=""
if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  CHANGED="$(git diff --name-only)"
  if [ -n "$CHANGED" ]; then
    OTHER="$(printf '%s\n' "$CHANGED" | grep -v -E '^(package\.json|package-lock\.json)$' || true)"
    if [ -n "$OTHER" ]; then
      echo "✖ Hay cambios locales en archivos versionados (no se tocan):"
      echo "$OTHER"
      echo "  Revísalos con git diff antes de desplegar."
      exit 1
    fi
    # Paquetes que existen en el package.json del servidor y no en el versionado
    # (los agregó install-partner-packages.sh) → @scope/pkg@1.2.3
    while IFS= read -r spec; do
      [ -n "$spec" ] && PARTNER_SPECS+=("$spec")
    done < <(node -e '
      const cur = require("./package.json");
      const head = JSON.parse(require("child_process").execSync("git show HEAD:package.json"));
      for (const sec of ["dependencies", "devDependencies"]) {
        const a = cur[sec] || {}, b = head[sec] || {};
        for (const [name, ver] of Object.entries(a)) {
          if (!(name in b) && !String(ver).startsWith("file:")) {
            console.log(name + "@" + String(ver).replace(/^[~^]/, ""));
          }
        }
      }' || true)
    PARTNER_STASH_MSG="deploy-partners-$(date +%Y%m%d-%H%M%S)"
    echo "▶ Guardando package.json local (partners: ${PARTNER_SPECS[*]:-ninguno}) → git stash \"$PARTNER_STASH_MSG\""
    git stash push -m "$PARTNER_STASH_MSG" -- package.json package-lock.json
  fi
  if [ "${SKIP_PULL:-0}" != "1" ]; then
    echo "▶ git pull --ff-only..."
    if ! git pull --ff-only; then
      echo "✖ git pull falló. Si había partners, están en git stash (\"$PARTNER_STASH_MSG\")."
      exit 1
    fi
  fi

  # Quitar archivos/carpetas no rastreados (alinea working tree tras git pull).
  # temp-pdfs: anexos de conductor habitual ya entregados a clientes (no borrar).
  echo "▶ git clean (untracked)..."
  git clean -fd --exclude=.env --exclude=logs --exclude=temp-pdfs
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      SysIP NestJS API — Deploy           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1. Crear carpeta de logs si no existe
mkdir -p "$LOG_DIR"

# 2. Instalar dependencias.
# NODE_ENV=production (PM2 / shell) hace que npm omita devDeps → nest/tsc: not found
# y puede borrar cientos de paquetes (el install anterior en QA quitó 569).
unset NODE_ENV
export npm_config_production=false
echo "▶ npm install --include=dev..."
npm install --include=dev --prefer-offline

# 2b. Reinstalar los partners que tenía el servidor (misma versión), antes del build.
if [ ${#PARTNER_SPECS[@]} -gt 0 ]; then
  if [ -f "$TOKENS_FILE" ]; then
    echo "▶ Reinstalando partners: ${PARTNER_SPECS[*]}"
    if bash scripts/install-partner-packages.sh "${PARTNER_SPECS[@]}"; then
      STASH_REF="$(git stash list --format='%gd %gs' | grep -F "$PARTNER_STASH_MSG" | head -1 | cut -d' ' -f1)"
      if [ -n "$STASH_REF" ]; then
        git stash drop "$STASH_REF" > /dev/null && echo "  stash $PARTNER_STASH_MSG eliminado (partners reinstalados)"
      fi
    else
      echo "⚠ No se pudieron reinstalar los partners; quedan en git stash (\"$PARTNER_STASH_MSG\")"
    fi
  else
    echo "⚠ Falta $TOKENS_FILE: no se reinstalan partners; quedan en git stash (\"$PARTNER_STASH_MSG\")"
  fi
fi

echo "▶ prisma generate..."
npm run prisma:generate

# 3. Compilar la API primero. El SDK de partners no debe bloquear el restart.
echo "▶ npx nest build..."
npx nest build

echo "▶ npm run build:partners (no bloquea si tsc falta en el SDK)..."
npm run build:partners || echo "⚠ SDK partners no compiló — sysip-nest-api sí se actualiza"

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
