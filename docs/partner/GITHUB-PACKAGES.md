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

### Instalar paquete partner externo

1. `~/.npmrc` con scope del integrador + PAT `read:packages`.
2. `npm install @ORG/partner-api-xxx@VERSION` en `server-api-sys`.
3. `.env`: `PARTNER_PACKAGES=@ORG/partner-api-xxx` — **no** en `ecosystem.config.js` (PM2 pisa dotenv).
4. `bash deploy.sh` → log: `Módulo partner cargado: ...`
