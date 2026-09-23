# Publicar e instalar `@jsotoexelixitech/nest-api-sdk` (GitHub Packages)

El scope **debe coincidir** con el dueño del repo en GitHub: `jsotoexelixitech/server-api-sys` → `@jsotoexelixitech/nest-api-sdk`.

## Si falla con 403 `write_package` o `permission_denied`

En el repo **server-api-sys** → **Settings** → **Actions** → **General** → sección **Workflow permissions**:

- Selecciona **Read and write permissions** (no solo Read).
- Guarda (**Save**).

Sin esto, `GITHUB_TOKEN` no puede publicar aunque el workflow declare `packages: write`.

### Plan B — secret `NPM_TOKEN` (si sigue 403)

1. GitHub → **Settings** (tu cuenta) → **Developer settings** → **Personal access tokens** → **Generate new token (classic)**.
2. Marca: **`write:packages`**, **`read:packages`**, **`repo`** (repo privado).
3. En **server-api-sys** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - Name: `NPM_TOKEN` (o `NESTAPI` — el workflow acepta ambos)
   - Value: el PAT
4. Vuelve a **Run workflow**. El workflow usa `NPM_TOKEN` si existe.

---

### GitHub Actions

1. **Actions → Publish @jsotoexelixitech/nest-api-sdk → Run workflow** (branch `main`).

O con tag:

```bash
git tag nest-api-sdk-v0.1.1
git push origin nest-api-sdk-v0.1.1
```

Paquete visible en: `https://github.com/jsotoexelixitech?tab=packages`

---

## Instalar (integrador partner)

`.npmrc`:

```
@jsotoexelixitech:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=SU_PAT_read:packages
```

```bash
npm install @jsotoexelixitech/nest-api-sdk
```

---

## srv001

Mismo `.npmrc` en `~/.npmrc` del usuario que ejecuta `npm install` para paquetes partner publicados.

El monorepo usa `file:packages/nest-api-sdk` en desarrollo; integradores usan la versión de GitHub Packages.

### Instalar / actualizar paquete partner externo

**Regla fija:** nunca borrar partners que ya estén en producción. Solo se **suman** o se actualiza la versión de uno.

#### Opción recomendada (sin cambiar token a mano)

GitHub Packages solo admite **un** `_authToken` por `npm.pkg.github.com`. Por eso:

| Enfoque | Cuándo |
|---------|--------|
| **Ideal:** un PAT / usuario máquina con `read:packages` en **todas** las orgs partner | Producción y QA a largo plazo → `TOKEN_DEFAULT` |
| **Práctico hoy:** tokens por proveedor en un archivo **fuera del repo** + script | Mientras cada partner da su propio PAT |

```bash
# Una vez por servidor (120 / 121 / GCIA)
mkdir -p ~/.config/exelixi-nest-partners
cp scripts/partner-tokens.env.example ~/.config/exelixi-nest-partners/tokens.env
chmod 600 ~/.config/exelixi-nest-partners/tokens.env
nano ~/.config/exelixi-nest-partners/tokens.env   # rellenar TOKEN_* o TOKEN_DEFAULT

# Instalar / actualizar todos + build + reload
bash scripts/install-partner-packages.sh --build --reload

# Solo un paquete
bash scripts/install-partner-packages.sh @gestacio/sysip-nest-api --build --reload
```

El script usa `--userconfig` temporal por paquete (no pisa tu `~/.npmrc` a ciegas). **Nunca** commits de `tokens.env`.

**No** uses un `.sh` por partner con el token hardcodeado en el repo: se filtra en git, backups y chats.

#### Pasos manuales (legacy)

1. Anotar partners actuales:
   ```bash
   grep '^PARTNER_PACKAGES=' .env
   npm ls --depth=0 | grep -E 'partner|quand-mind|esanchez'
   ```
2. `.npmrc` con scopes + PAT `read:packages` de la org del paquete a instalar (token real, no placeholder).
3. `npm install @ORG/partner-api-xxx@VERSION` en `server-api-sys`.
4. `.env`: **añadir** el paquete a `PARTNER_PACKAGES` (coma-separado). Ejemplo:
   ```env
   PARTNER_PACKAGES=@esanchez-exelixitech/partner-api-test,@exelixi/partner-api-starter,@quand-mind/api_planes_v2,@gestacio/sysip-nest-api
   ```
   **No** en `ecosystem.config.js` (PM2 pisa dotenv).
5. Si un partner previo desapareció de `node_modules`, reinstalarlo antes del restart.
6. `npm run build && pm2 reload sysip-nest-api` → log debe listar **todos** en `Partner modules loaded`.
7. Revisar log: `Swagger: catálogo admin sin OpenAPI (...)` indica rutas sin `@ApiOperation` — el integrador debe añadir decoradores Swagger (ver `docs/NEST-AUTH-SWAGGER-FILTRADO.md`). El host igual muestra la ruta en docs filtrados (stub) si la key tiene el grant.
