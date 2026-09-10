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

Exelixi instala en el servidor, configura `PARTNER_PACKAGES` y despliega. Tus APIs quedan en Swagger sin tocar el core.

### Rutas bajo `/api/v1/renovations/` (renovaciones)

El host indexa automáticamente el scope **`renovations:write`** para cualquier ruta en ese prefijo (aparece en `/admin` al crear tokens).

En tu controller usa el tag unificado del SDK (evita duplicar secciones en Swagger):

```typescript
import {
  NestPartnerProtected,
  PARTNER_RENOVATIONS_SWAGGER_TAG,
} from '@jsotoexelixitech/nest-api-sdk';

@ApiTags(PARTNER_RENOVATIONS_SWAGGER_TAG)
@Controller('v1/renovations/v2')
export class RenovationsController {
  @Post('create')
  @NestPartnerProtected('renovations:write')
  create() { /* ... */ }
}
```

Opcional: exporta también `partnerScopes` con la ruta exacta (`POST /api/v1/renovations/v2/create`) para descripción en el panel admin.

Si no exportas `partnerScopes`, el host descubre las rutas al arrancar y crea scopes `partner:{slug}` solo bajo `/api/v1/partner/{slug}/`.

## Referencia QA (plantilla de ejemplo ya activa)

```
GET /api/v1/partner/starter/health
```
