# Plantilla partner-api-starter

Copia esta carpeta a **tu repo privado**. No clona ningun repo de Exelixi.

## 1. Renombrar paquete

En `package.json`, cambia `@TU-ORG/partner-api-xxx` por el nombre real de tu paquete npm.

## 2. Configurar npm

Copia `.npmrc.example` a `.npmrc` y pon tu PAT de GitHub con `read:packages`:

```
@jsotoexelixitech:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=TU_TOKEN
```

## 3. Instalar y compilar

```bash
npm install
npm run build
```

## 4. Desarrollar

- Edita `src/partner-starter.controller.ts` (rutas, logica).
- Renombra archivos/clases segun tu modulo.
- Usa `@ApiTags(PARTNER_SWAGGER_TAG)` para que aparezca en Swagger bajo **Partner**.
- Exporta `register()` desde `src/index.ts` (ya viene en la plantilla).

## 5. Publicar tu paquete

Publica en GitHub Packages (scope = tu cuenta u organizacion):

```bash
npm publish
```

## 6. Entregar a Exelixi

Envia:

1. Nombre del paquete (ej. `@tu-org/partner-api-xxx`)
2. Version (ej. `0.1.0`)
3. Token de lectura de tu paquete (`read:packages`) o acceso al registry
4. (Opcional) `partnerScopes` en `src/partner-scopes.ts` — el host los muestra en el panel admin al crear tokens

Exelixi instala en el servidor, configura `PARTNER_PACKAGES` y despliega. Tus APIs quedan en Swagger sin tocar el core. Si no exportas `partnerScopes`, el host descubre las rutas al arrancar y crea scopes `partner:{slug}` automáticamente.

## Referencia QA (plantilla de ejemplo ya activa)

```
GET /api/v1/partner/starter/health
```
