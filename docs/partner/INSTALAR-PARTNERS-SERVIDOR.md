# Partners npm — instalación en cualquier servidor

Guía única para **srv001 (120)**, **srv001qa (121)** y **GCIA (172.30.149.75)**.

Aplica a: `~/server-api-sys` · PM2 `sysip-nest-api` · rama de deploy **`qa`** (o `main` si el entorno usa `main`).

---

## Objetivo

Que Nest cargue todos los paquetes de `PARTNER_PACKAGES` y aparezcan en Swagger:

| Paquete | Rol típico |
|---------|------------|
| `@exelixi/partner-api-starter` | Local (`file:`) — siempre en el monorepo |
| `@quand-mind/api_planes_v2` | Planes / patrimonial / proveedores |
| `@esanchez-exelixitech/partner-api-test` | Siniestros partner (`validar`, `emitir`, `buscar-*`, etc.) |
| `@gestacio/sysip-nest-api` | Products / providers (`consultar-polizas`) / gestor |

---

## Reglas fijas

1. **No** borrar partners ya instalados; solo sumar o actualizar versión.
2. `PARTNER_PACKAGES` vive en **`.env`** del servidor — **nunca** en `ecosystem.config.js` (PM2 pisa dotenv).
3. Tokens de GitHub Packages: **fuera del repo** (`~/.config/.../tokens.env`, `chmod 600`).
4. Antes de build: `unset NODE_ENV PORT VITE_APP_BASE DATABASE_URL` (con `NODE_ENV=production`, `npm install` omite `@nestjs/cli`).
5. Tras instalar: `npm run build` + `pm2 reload sysip-nest-api` (no hace falta `--update-env` salvo cambio real de env).

---

## Mapa por entorno

| Entorno | SSH | Repo | Swagger completo |
|---------|-----|------|------------------|
| Dev / cierre **120** | `jsoto@srv001` | `~/server-api-sys` | https://cierrelmds.exelixitech.com/nest-api-docs/docs |
| QA **121** | `proyect@srv001qa` | `~/server-api-sys` | https://nexusqa.exelixitech.com/nest-api-docs/docs |
| Prod GCIA | `proyect@Srv-Gcia-proyect` | `~/server-api-sys` (o ruta del host) | http://172.30.149.75:3002/docs |

Swagger filtrado por key: `…/nest-api-docs/docs/client/doc_<slug>` (o `…/docs/client/doc_<slug>` en IP `:3002`).

---

## Paso 0 — Diagnóstico

```bash
cd ~/server-api-sys
git fetch origin && git checkout qa && git pull origin qa
git log -1 --oneline

grep '^PARTNER_PACKAGES=' .env || true
echo "NODE_ENV=$NODE_ENV"
ls node_modules/@nestjs/cli/package.json 2>&1
npm ls --depth=0 2>&1 | grep -E 'quand-mind|esanchez|gestacio|partner-api-starter' || true

pm2 describe sysip-nest-api | grep -E 'status|uptime|restarts'
```

`PARTNER_PACKAGES` esperado (ajustar si el entorno no usa alguno):

```env
PARTNER_PACKAGES=@esanchez-exelixitech/partner-api-test,@exelixi/partner-api-starter,@quand-mind/api_planes_v2,@gestacio/sysip-nest-api
```

Si falta Nest CLI:

```bash
unset NODE_ENV
npm install --include=dev
npx nest --version
```

---

## Paso 1 — Archivo de tokens (una vez por usuario SSH)

```bash
mkdir -p ~/.config/exelixi-nest-partners
cd ~/server-api-sys
cp scripts/partner-tokens.env.example ~/.config/exelixi-nest-partners/tokens.env
chmod 600 ~/.config/exelixi-nest-partners/tokens.env
nano ~/.config/exelixi-nest-partners/tokens.env
```

### Ideal (un solo PAT con `read:packages` en las 3 orgs)

```bash
TOKEN_DEFAULT=ghp_xxxxxxxx
TOKEN_QUAND_MIND=
TOKEN_ESANCHEZ=
TOKEN_GESTACIO=
```

### Mientras cada partner da su propio PAT

```bash
TOKEN_DEFAULT=
TOKEN_QUAND_MIND=ghp_...
TOKEN_ESANCHEZ=ghp_...
TOKEN_GESTACIO=ghp_...
```

**No** commits de este archivo. **No** pegar tokens en chats públicos. Si un token se filtra → revocar en GitHub y regenerar.

> **Por qué no 3 tokens en un solo `.npmrc`:** npm solo admite **un** `_authToken` para `npm.pkg.github.com`. El script rota el token por paquete con un npmrc temporal.

Doc detallada: `docs/partner/GITHUB-PACKAGES.md`.

---

## Paso 2 — Instalar / actualizar partners (recomendado)

```bash
cd ~/server-api-sys
unset NODE_ENV PORT VITE_APP_BASE DATABASE_URL

# Todos los partners del script + build + reload PM2
bash scripts/install-partner-packages.sh --build --reload

# O solo uno:
# bash scripts/install-partner-packages.sh @gestacio/sysip-nest-api --build --reload
```

El script:

- Lee `~/.config/exelixi-nest-partners/tokens.env`
- Hace `npm install <pkg> --save` con auth temporal
- Con `--build` / `--reload` recompila y recarga Nest

Si el script **no existe** aún en el servidor:

```bash
git pull origin qa   # commit chore(partner): install-partner-packages.sh
```

---

## Paso 3 — Verificar carga

```bash
pm2 logs sysip-nest-api --lines 50 --nostream | grep -E 'PARTNER_PACKAGES|Partner modules loaded|Módulo partner|No se pudo cargar'
```

Éxito típico:

```text
Partner modules loaded: @esanchez-exelixitech/partner-api-test, @exelixi/partner-api-starter, @quand-mind/api_planes_v2, @gestacio/sysip-nest-api
```

Sin `Cannot find module '...'`.

Rutas de ejemplo:

```bash
curl -sS http://127.0.0.1:3002/docs-json | grep -oE '/api/v1/partner/providers/consultar-polizas|/api/v1/siniestros/(validar|ajustar)|/api/v1/partner/starter/patrimonial/quote' | sort -u
```

Abrir Swagger del entorno (tabla arriba) y Ctrl+F5.

---

## Paso 4 — Si falla con 403 `read_package`

| Causa | Qué hacer |
|-------|-----------|
| Token vacío / mal pegado en `tokens.env` | Revisar archivo (`chmod 600`) |
| PAT sin acceso a esa org | Pedir `read:packages` al dueño del paquete |
| Token revocado | Generar otro y actualizar `tokens.env` |
| `NODE_ENV=production` rompió `node_modules` | `unset NODE_ENV && npm install --include=dev` y reintentar |

Instalación manual de emergencia (un paquete):

```bash
# Temporal: token en ~/.npmrc solo para ese install
nano ~/.npmrc
# scopes + //npm.pkg.github.com/:_authToken=...

npm install @ORG/paquete --save
```

Mejor: corregir `tokens.env` y volver a `bash scripts/install-partner-packages.sh …`.

---

## Paso 5 — Actualizar un partner cuando salga versión nueva

### ¿Hay versión nueva en el registry?

```bash
cd ~/server-api-sys
git pull origin qa   # trae scripts/check-partner-versions.sh
bash scripts/check-partner-versions.sh
```

Salida: columnas `INSTALLED` / `LATEST` / `STATUS` (`OK` o `ACTUALIZAR`).

1. Actualizar token en `tokens.env` si cambió.
2. Opcional: fijar versión en el comando:

```bash
bash scripts/install-partner-packages.sh @quand-mind/api_planes_v2@0.5.1 --build --reload
```

(Si el script no acepta `@version` en el nombre, usar `npm install pkg@version --save` con el mismo flujo de tokens / o ampliar el script.)

3. Confirmar log `Módulo partner cargado: …` y Swagger.

---

## Checklist rápido (copiar/pegar)

```bash
cd ~/server-api-sys
git pull origin qa
unset NODE_ENV PORT VITE_APP_BASE DATABASE_URL

# tokens ya configurados en ~/.config/exelixi-nest-partners/tokens.env
bash scripts/install-partner-packages.sh --build --reload

grep '^PARTNER_PACKAGES=' .env
pm2 logs sysip-nest-api --lines 40 --nostream | grep -E 'Partner modules loaded|No se pudo cargar'
```

---

## Relacionado

| Doc | Contenido |
|-----|-----------|
| `docs/partner/GITHUB-PACKAGES.md` | Publicar SDK, 403, `PARTNER_PACKAGES` |
| `docs/NEST-AUTH-SWAGGER-FILTRADO.md` | Swagger filtrado por API key vs catálogo |
| `scripts/install-partner-packages.sh` | Instalador multi-token |
| `scripts/partner-tokens.env.example` | Plantilla de tokens |

---

## Incidentes frecuentes

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Swagger sin APIs partner | Paquete no en `node_modules` / no en `PARTNER_PACKAGES` | Paso 1–3 |
| `could not determine executable to run` (`nest build`) | Falta `@nestjs/cli` por `NODE_ENV=production` | `npm install --include=dev` |
| `removed NNN packages` tras un `npm install` mal hecho | `node_modules` roto | `npm install --include=dev` + reinstalar partners |
| Key Venemergencia solo ve auth | Grant en key pero partner no cargado / filtro Swagger | Cargar Gestacio + fix docs filtrados en rama `qa` |
| 403 al instalar en un servidor y no en otro | `~/.npmrc` / `tokens.env` del **usuario SSH** distinto | Configurar tokens en ese home |
