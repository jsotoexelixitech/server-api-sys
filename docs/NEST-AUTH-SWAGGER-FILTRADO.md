# Swagger filtrado por API key (contrato operativo)

Cada key tiene un enlace `doc_<slug>` que muestra **solo** los endpoints autorizados. Esto debe coincidir con lo que el admin muestra al crear/editar la key.

## Reglas (no negociables)

1. **Si una ruta aparece en el panel admin como grant concedible, debe aparecer en el Swagger filtrado** cuando esa ruta (o su scope) está en la key.
2. **Sin scopes / grants vacíos:** solo `POST /api/v1/auth/token` (y refresh si aplica). Nada más.
3. **Rutas sin scope inferible** no se publican por “accidente”; hace falta grant granular `METHOD /path` o scope legacy (`partner:providers`, `endosos:write`, etc.).
4. **Runtime y documentación:** el guard usa los mismos grants que el filtro Swagger (`grantMatchesRoute`).

## Dos fuentes de verdad al arrancar

| Fuente | Origen | Uso |
|--------|--------|-----|
| **Catálogo admin** | `NEST_AUTH_SCOPE_CATALOG` + `partnerScopes` + rutas descubiertas | Crear keys, lista de grants |
| **OpenAPI almacenado** | `SwaggerModule.createDocument()` | Schemas, try-it-out, filtro inicial |

Los paquetes **partner** a menudo registran rutas en `partnerScopes` o por descubrimiento de controllers, pero **no** generan path en OpenAPI si el controlador no lleva decoradores Swagger.

**Comportamiento del host (desde fix 2026-09):** `OpenApiFilterService.appendGrantedCatalogRoutes` inyecta en el doc filtrado las rutas del catálogo a las que la key tiene acceso, aunque falten en OpenAPI (stub mínimo bajo tag **8. Integraciones partner**). Si el path sí existe en OpenAPI, se reutiliza la operación completa.

## Integradores partner (recomendado)

En cada endpoint público:

- `@ApiTags(PARTNER_SWAGGER_TAG)` o tag **8. Integraciones partner**
- `@ApiOperation`, `@ApiBody` / `@ApiResponse` según contrato

Así el Swagger filtrado incluye **schemas** y no solo el stub del catálogo.

Plantilla: `docs/partner/partner-api-starter-template/`.

## Verificación tras deploy

En el servidor (`sysip-nest-api`):

```bash
# Sustituir DOC_SLUG por docs_slug de la key (admin → Abrir Swagger)
curl -sS "http://127.0.0.1:3002/api/v1/docs/view/doc_XXXXX" | grep -E '"/api/v1/partner'
```

Log de arranque: si una ruta partner está en catálogo pero no en OpenAPI, aparece:

`Swagger: catálogo admin sin OpenAPI (POST /api/v1/partner/...)`

## Tests de regresión

- `src/modules/docs/open-api-filter.service.spec.ts` — keys vacías, endoso-recibos, partner solo catálogo
- `src/modules/auth/scopes/route-grants.spec.ts` — grants granulares vs scopes legacy

Antes de cerrar cambios en auth/docs: `npm test -- --testPathPattern="open-api-filter|route-grants"`.

## Incidentes relacionados

| Fecha | Síntoma | Causa | Fix |
|-------|---------|-------|-----|
| 2026-09 | Todos los doc_* veían `endoso-recibos` | Rutas sin scope → `return true` en filtro | `6f0f018` — denegar sin scope |
| 2026-09 | Key Venemergencia solo auth | Catálogo partner ≠ paths OpenAPI | `appendGrantedCatalogRoutes` + tests |
