# Autenticación nest-api (token propio)

Sistema **independiente de Nexus**. Los módulos Exélixi (emision-api, form-api) obtienen token aquí para llamar emisión/cobranza/documentos.

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/v1/auth/token` | Canje `{ "grant_type": "api_key", "apikey": "..." }` |
| POST | `/api/v1/auth/refresh` | Renovar `{ "refresh_token": "..." }` |

## URLs

| Entorno | Base |
|---------|------|
| srv001 interno | `http://127.0.0.1:3002` |
| HTTPS externo | `https://cierrelmds.exelixitech.com/api-docs-nest-api` |

## Variables nest-api (.env)

```env
NEST_AUTH_ENABLED=false          # true en prod pública
NEST_AUTH_REQUIRE_HTTPS=true    # canje/refresh solo HTTPS (127.0.0.1 exento)
NEST_JWT_SECRET=<32+ chars>
NEST_ACCESS_TTL_SEC=900
NEST_REFRESH_TTL_SEC=604800
NEST_TOKEN_SLIDE_SEC=300
```

## Variables módulos (.env)

```env
NEST_API_URL=https://cierrelmds.exelixitech.com/api-docs-nest-api
NEST_API_KEY=<maclient_api>
NEST_AUTH_USE_TOKEN=true
```

El cliente `nestTokenService.js` canjea al arranque, envía `Authorization: Bearer`, renueva con `/auth/refresh` y aplica `X-Nest-Access-Refreshed` en cada respuesta.

## Rutas protegidas (cuando `NEST_AUTH_ENABLED=true`)

- `POST /external/createEmissionAuto`
- `POST /personas/emision` y `/external/createEmissionPerson`
- `POST /external/collection/*` (notific, collect, activate)
- `POST /documents/conductor-habitual`

Catálogos (`valrep`, `inma`, cotización) siguen **públicos**.

## Compatibilidad

Header `apikey` sigue aceptado en rutas protegidas durante la migración.
