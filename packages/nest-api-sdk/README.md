# @exelixi/nest-api-sdk

Contrato público para desarrollar módulos partner de **sysip-nest-api** sin acceso al repositorio core.

## Instalación (integradores)

1. Crear [PAT de GitHub](https://github.com/settings/tokens) con `read:packages`.
2. Configurar `.npmrc` (ver `.npmrc.example` en este paquete).
3. Instalar:

```bash
npm install @exelixi/nest-api-sdk
```

## Uso mínimo

```typescript
import {
  EXELIXI_PARTNER_HOST,
  ExelixiPartnerHost,
  PARTNER_SWAGGER_TAG,
  PartnerModuleRegisterOptions,
} from '@exelixi/nest-api-sdk';
```

Exporte `register()` desde su paquete npm para que el host lo cargue vía `PARTNER_PACKAGES`.

## Publicación (solo Exélixi)

Ver `docs/partner/GITHUB-PACKAGES.md` en el repositorio `server-api-sys`.
