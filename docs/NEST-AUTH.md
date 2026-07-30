# Autenticación nest-api (token propio)

Sistema **independiente de Nexus**. Todos los endpoints de la API exigen autenticación cuando `NEST_AUTH_ENABLED=true` (default).

## Excepciones (@Public)

| Ruta | Motivo |
|------|--------|
| `POST /api/v1/auth/token` | Canje inicial con `apikey` en body |
| `POST /api/v1/auth/refresh` | Renovación con `refresh_token` |
| `/api/v1/admin/*` | Usa header `X-Admin-Token` (panel keys) |

Todo lo demás (valrep, inma, personas, emisión, cobranza, partner, documentos) requiere:

- `Authorization: Bearer <access_token>`, **o**
- header `apikey: nest_...` / legacy `maclient_api`

Los **scopes** solo restringen emisión/cobranza/documentos; el resto solo exige identidad válida.

## Endpoints auth

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/v1/auth/token` | Canje `{ "grant_type": "api_key", "apikey": "..." }` |
| POST | `/api/v1/auth/refresh` | Renovar `{ "refresh_token": "..." }` |

## Panel admin (API keys + scopes)

| Recurso | URL |
|---------|-----|
| UI | `http://127.0.0.1:3002/admin/` |
| API | `/api/v1/admin/keys` · header `X-Admin-Token` |

## Variables nest-api (.env)

```env
NEST_AUTH_ENABLED=true           # default: auth global en toda la API
NEST_AUTH_REQUIRE_HTTPS=true     # canje/refresh HTTPS (127.0.0.1 exento)
NEST_JWT_SECRET=<32+ chars>
NEST_PG_DATABASE_URL=postgresql://...
NEST_ADMIN_TOKEN=<panel admin>
```

## Variables módulos (.env)

```env
NEST_API_URL=http://127.0.0.1:3002
NEST_API_KEY=nest_...
NEST_AUTH_USE_TOKEN=true         # Bearer en todas las llamadas HTTP
```

## Scopes (solo rutas sensibles)

| Scope | Endpoints |
|-------|-----------|
| `emissions:auto` | `POST /external/createEmissionAuto` |
| `emissions:person` | `POST /personas/emision`, `/external/createEmissionPerson` |
| `collection:write` | `POST /external/collection/*` |
| `documents:write` | `POST /documents/conductor-habitual` |

Catálogos (`valrep/*`, `inma/*`, `personas/planes`, etc.) requieren token pero **sin scope** específico.
