# Publicar e instalar `@jsotoexelixitech/nest-api-sdk` (GitHub Packages)

El scope **debe coincidir** con el dueño del repo en GitHub: `jsotoexelixitech/server-api-sys` → `@jsotoexelixitech/nest-api-sdk`.

---

## Publicar (Exélixi)

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
