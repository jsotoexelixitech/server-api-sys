# Publicar e instalar `@exelixi/nest-api-sdk` (GitHub Packages)

## Requisito de scope en GitHub

El paquete se publica como **`@exelixi/nest-api-sdk`**. En GitHub Packages el scope `@exelixi` debe existir como **organización** en GitHub:

1. Crear org [github.com/exelixi](https://github.com/organizations/plan) (si no existe).
2. Dar acceso al repo `server-api-sys` a miembros que publican, **o** transferir el repo bajo la org `exelixi`.
3. Alternativa temporal: publicar como `@jsotoexelixitech/nest-api-sdk` cambiando el `name` en `packages/nest-api-sdk/package.json` (mismo repo bajo usuario `jsotoexelixitech`).

---

## Publicar (Exélixi)

### Opción A — GitHub Actions (recomendada)

1. Subir tag (dispara el workflow):

```bash
cd packages/nest-api-sdk
npm version patch   # 0.1.0 → 0.1.1
cd ../..
git add packages/nest-api-sdk/package.json
git commit -m "chore(sdk): bump nest-api-sdk version"
git tag nest-api-sdk-v0.1.1
git push origin main --tags
```

2. O en GitHub: **Actions → Publish @exelixi/nest-api-sdk → Run workflow**.

3. Ver paquete: `https://github.com/orgs/exelixi/packages` (o packages del owner del repo).

### Opción B — Manual desde tu PC

```bash
cd packages/nest-api-sdk
npm run build
npm publish --registry=https://npm.pkg.github.com
```

`.npmrc` local (no commitear):

```
@exelixi:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=ghp_...
```

PAT con permiso `write:packages` y `read:packages`.

---

## Instalar (integrador partner)

`.npmrc` en su proyecto:

```
@exelixi:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=SU_PAT_READ_PACKAGES
```

```bash
npm install @exelixi/nest-api-sdk
```

Invitar al integrador como colaborador del paquete o de la org `exelixi` con permiso **read packages**.

---

## srv001 (consumir SDK publicado)

Cuando un partner publique su paquete en GitHub Packages:

```bash
# ~/.npmrc del usuario jsoto en srv001
@exelixi:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=TOKEN_CON_READ_PACKAGES

cd ~/server-api-sys
npm install @exelixi/partner-nombre-cliente@1.0.0
# PARTNER_PACKAGES=@exelixi/partner-nombre-cliente
bash deploy.sh
```

El monorepo sigue usando `file:packages/nest-api-sdk` para desarrollo interno; los integradores usan la versión publicada.
