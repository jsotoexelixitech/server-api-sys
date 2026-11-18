# Changelog

Todos los cambios notables de este proyecto se documentan aquí.  
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Unreleased]

### Añadido

- **`MailModule`**: `POST /api/v1/mail/policy-emission` acepta una segunda póliza (`cnpoliza_rcv`, `cnrecibo_rcv`, `fanopol_rcv`, `fmespol_rcv`, `urlpoliza_rcv`, `producto_rcv`; `producto` para la principal), `url_beneficiario_preferencial` y `attachments` (`{ filename, url }` o base64). Con dos pólizas el asunto y el texto nombran ambas y se adjuntan los dos cuadros; con una sola el correo no cambia. Lo que no se pueda adjuntar se omite y se informa en `adjuntos.enviados` / `adjuntos.omitidos` (campo nuevo de la respuesta, modo smtp). Pedido de Auto Casco (emisión con Pérdida Total + RCV).
- **`MailModule`**: adjuntos por `url` también en `POST /api/v1/mail/send` (400 si no se puede usar). Descarga protegida contra SSRF: solo https, lista blanca `MAIL_ATTACHMENT_URL_HOSTS` (por defecto qaapi/sys2000/qasys2000.lamundialdeseguros.com, `*.lamundialdeseguros.com`, `*.exelixitech.com` + hosts de `POLICY_PDF_URL`/`ARYS_*`), sin IP privada para hosts por comodín, redirecciones revalidadas, `MAIL_ATTACHMENT_URL_TIMEOUT_MS` (30 s), 8 MB por archivo y contenido pdf/xlsx/csv por magic bytes. Los PDFs de `urlpoliza`, recibo, club Arys, etc. pasan por la misma descarga.
- **`EmissionsModule`**: `POST /api/v1/emissions/automobile_new/propietary` — migración desde SysIP Express (`searchNewPropietary`). Busca propietario en `maclient` por `cid` / `cci_rif`.

### Cambiado

- **`MailModule`**: máximo de adjuntos de 5 a 8 y tope total de 8 a 15 MB (≈ 20 MB codificados, bajo el límite usual de 25 MB de los buzones); body JSON de `/mail/send` y `/mail/policy-emission` hasta 22 MB.
- **`EmissionsModule`**: `POST /api/v1/emissions/automobile/vehicle` — alineado a SysIP Express (`validatePlaca` / `dbo.fn_validar_placa`) con body `xplaca`|`placa`, `fdesde` y `type`.
- **`EmissionsModule`**: `POST /api/v1/emissions/automobile/serial` — alineado a SysIP Express (`validateSerial` / `dbo.fn_validar_serialCar`) con body `xsercar`|`xserialcarroceria`, `fdesde` y `type`.

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
