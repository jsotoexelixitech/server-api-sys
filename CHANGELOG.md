# Changelog

Todos los cambios notables de este proyecto se documentan aquí.  
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [0.1.0] – 2026-05-14

### Inicial — migración desde Express a NestJS

#### Añadido

- **Proyecto NestJS** desde cero con arquitectura modular y Swagger
- **`ValrepModule`** (`/api/v1/valrep`)
  - `POST /planes/v2` — replica `spBuscaPlan` con parentescos y coberturas
  - `POST /cotizacion` — cotización RCV via `spCalculoAuto` (USD + Bs)
  - `GET /states`, `GET /cities` — catálogos de estados y ciudades
  - `GET /matipos`, `POST /macategtr` — tipos y categorías de vehículos
- **`InmaModule`** (`/api/v1/inma`)
  - `GET /anios` — rango de años en VInma
  - `POST /marcas`, `POST /marca/:ctipo` — marcas por año y tipo
  - `POST /modelo`, `POST /version` — modelos y versiones
  - `POST /categorias-uso` — categorías de uso por vehículo concreto
- **`ClientModule`** (`/api/v1/client`)
  - `GET /search/:cci_rif` — datos completos del cliente
  - `GET /search/policies/:cci_rif` — pólizas via `spGetPolizasAsegurado`
- **`EmissionsModule`** (`/api/v1/emissions`, `/api/v1/external`)
  - `POST /emissions/automobile/vehicle` — búsqueda por placa
  - `POST /emissions/automobile/serial` — búsqueda por serial
  - `POST /external/validateEmissionPerson` — `speeValidatePersonGeneral`
  - `POST /external/validateEmissionAuto` — `speeValidateAutomovilGeneral`
  - `POST /external/createEmissionAuto` — emisión de póliza con `apikey`
- **`ChangesModule`** (`/api/v1/changes`)
  - `POST /client` — actualización de datos en cascada (6 tablas)
- **Pool de conexiones** MSSQL compartido (`DatabaseModule` global, max 20)
- **`AllExceptionsFilter`** — errores uniformes, nunca filtra SQL ni stacks
- **`ResponseInterceptor`** — envelope `{ status: true, data }` automático
- **`ValidationPipe`** global — `whitelist: true`, `transform: true`
- **Swagger** completo con DTOs, ejemplos y respuestas de error en todos los endpoints
- **PM2** — `ecosystem.config.js` y `deploy.sh` listos para producción
- **`api-error-responses.ts`** — decoradores reutilizables `@ApiCommonErrors`, `@Api400`, `@Api401`, `@Api404`, `@Api500`
- **`.env.example`** con todas las variables documentadas
- **CI** — GitHub Actions type-check en cada push y PR

#### Seguridad

- Todas las queries usan `req.input()` parametrizado (sin SQL injection)
- Errores de SP devuelven `{ status: false, error: "..." }` en vez de 500
- Path params `cci_rif` validados como numéricos antes de llegar al SP
- Cotización: errors del SP devuelven 400 con mensaje útil en lugar de 500

#### Arquitectura

- Puerto 3001 (Express original sigue en 3000)
- `NODE_ENV=production` en PM2 deshabilita Swagger si `SWAGGER_PATH=''`
- Logs separados `out.log` / `error.log` en `./logs/`
