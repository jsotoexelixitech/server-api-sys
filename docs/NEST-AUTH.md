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
| UI | `http://192.168.8.120:3002/admin/` (srv001) |
| API | `/api/v1/admin/keys` · header `X-Admin-Token` |

### Uso del panel visual

1. Abrir `/admin/` en el navegador.
2. Copiar `NEST_ADMIN_TOKEN` del `.env` de nest-api en srv001:
   ```bash
   grep NEST_ADMIN_TOKEN ~/server-api-sys/.env
   ```
3. Pegarlo en **X-Admin-Token** → **Conectar** (se guarda en el navegador).
4. Aparecen los **scopes** y la tabla **Keys registradas** (prefijo, estado, último uso).
5. **Crear key:** nombre, `cproductor` (ej. `80080`), scopes según módulo → **Crear key**.
6. **Copiar `plainKey`** (caja azul) — **solo se muestra una vez** → pegar en el `.env` del módulo como `NEST_API_KEY`.
7. `pm2 restart <modulo>-api --update-env`

> **Catálogos solamente (formulario):** puede crear la key **sin marcar scopes**.  
> **Emisión:** marcar `emissions:auto`, `emissions:person`, `collection:write` según use el módulo.

### Keys sugeridas en srv001

| Nombre | Módulo | Scopes |
|--------|--------|--------|
| `modulo-emision QA` | emision-api | auto, person, collection |
| `modulo-formulario QA` | form-api | ninguno (solo catálogos) |

La tabla del panel **no muestra el secreto completo** (solo prefijo `nest_78cd568c…`). Si perdió la key, revoque y cree una nueva.

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
