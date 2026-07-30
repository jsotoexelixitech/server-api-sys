# Autenticación nest-api (token propio)

Sistema **independiente de Nexus**. Los módulos Exélixi (emision-api, form-api) obtienen token aquí para llamar emisión/cobranza/documentos.

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/v1/auth/token` | Canje `{ "grant_type": "api_key", "apikey": "..." }` |
| POST | `/api/v1/auth/refresh` | Renovar `{ "refresh_token": "..." }` |

## Panel admin (API keys + scopes)

| Recurso | URL |
|---------|-----|
| UI | `http://127.0.0.1:3002/admin/` |
| API | `/api/v1/admin/keys` · header `X-Admin-Token` |
| Scopes | `/api/v1/admin/scopes` |

Variables: `NEST_PG_DATABASE_URL`, `NEST_ADMIN_TOKEN`.

Keys generadas: prefijo `nest_` · scopes por endpoint · refresh tokens en PostgreSQL.

## PostgreSQL (esquema `nest_auth`)

| Campo | Valor srv001 |
|-------|----------------|
| Host | `192.168.8.120:5432` |
| BD | `nest_api` (recomendada) |
| Esquema | `nest_auth` |
| Init SQL | `docs/sql/postgres/nest-auth-init.sql` |

```bash
# En nest-api (tras crear BD/esquema)
npx prisma db push
npx prisma generate
```

## Scopes

| Scope | Endpoints |
|-------|-----------|
| `emissions:auto` | `POST /external/createEmissionAuto` |
| `emissions:person` | `POST /personas/emision`, `/external/createEmissionPerson` |
| `collection:write` | `POST /external/collection/*` (notific, collect, activate) |
| `documents:write` | `POST /documents/conductor-habitual` |
| `*` | Acceso total (legacy maclient_api) |

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
NEST_PG_DATABASE_URL=postgresql://user:pass@192.168.8.120:5432/nest_api?schema=nest_auth
NEST_ADMIN_TOKEN=<secreto-admin-panel>
```

## Variables módulos (.env)

```env
NEST_API_URL=https://cierrelmds.exelixitech.com/api-docs-nest-api
NEST_API_KEY=nest_...           # key creada en panel admin
NEST_AUTH_USE_TOKEN=true
```

El cliente `nestTokenService.js` canjea al arranque, envía `Authorization: Bearer`, renueva con `/auth/refresh` y aplica `X-Nest-Access-Refreshed` en cada respuesta.

## Rutas protegidas (cuando `NEST_AUTH_ENABLED=true`)

- `POST /external/createEmissionAuto` → `emissions:auto`
- `POST /personas/emision` y `/external/createEmissionPerson` → `emissions:person`
- `POST /external/collection/*` → `collection:write`
- `POST /documents/conductor-habitual` → `documents:write`

Catálogos (`valrep`, `inma`, cotización) siguen **públicos**.

## Compatibilidad

- Keys `nest_*` en PostgreSQL con scopes granulares.
- Header `apikey` legacy (`maclient_api`) sigue aceptado con scope `*` durante migración.
