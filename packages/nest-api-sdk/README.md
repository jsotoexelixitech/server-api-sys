# @jsotoexelixitech/nest-api-sdk

Contrato público para desarrollar módulos partner de **sysip-nest-api** sin acceso al repositorio core.

Publicado en GitHub Packages del repo `jsotoexelixitech/server-api-sys`.

## Instalación (integradores)

1. Crear [PAT de GitHub](https://github.com/settings/tokens) con `read:packages`.
2. Configurar `.npmrc` (ver `.npmrc.example` en este paquete).
3. Instalar:

```bash
npm install @jsotoexelixitech/nest-api-sdk
```

## Uso mínimo

```typescript
import {
  EXELIXI_PARTNER_HOST,
  ExelixiPartnerHost,
  PARTNER_SWAGGER_TAG,
} from '@jsotoexelixitech/nest-api-sdk';
```

Exporte `register()` desde su paquete npm para que el host lo cargue vía `PARTNER_PACKAGES`.

## Renovaciones (`/api/v1/renovations/*`)

- Tag Swagger: `PARTNER_RENOVATIONS_SWAGGER_TAG` (`11. Renovaciones`)
- Scope recomendado: `renovations:write` vía `@NestPartnerProtected('renovations:write')`
- El host auto-indexa rutas bajo `/api/v1/renovations/` en el panel `/admin` aunque no exporte `partnerScopes`
