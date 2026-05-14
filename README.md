# SysIP NestJS API

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![SQL Server](https://img.shields.io/badge/SQL%20Server-2019-CC2927?logo=microsoftsqlserver&logoColor=white)
![PM2](https://img.shields.io/badge/PM2-Ready-2B037A?logo=pm2&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

**Backend NestJS que reemplaza gradualmente el servidor Express original.**  
Misma base de datos SQL Server · Arquitectura modular · Swagger incluido · Listo para PM2

[Swagger UI](http://localhost:3001/docs) · [Endpoints](#endpoints) · [Deploy](#despliegue-con-pm2) · [Changelog](CHANGELOG.md)

</div>

---

## ¿Qué hace este proyecto?

Este servidor NestJS convive en **paralelo** con el Express original (puerto 3000) usando la misma base de datos Sis2000. La migración es progresiva: cada módulo se mueve aquí con:

- ✅ Queries **parametrizadas** (sin SQL injection)
- ✅ **Validación de entrada** con `class-validator` (400 con mensaje claro si falla)
- ✅ **Manejo de errores uniforme** — nunca se filtran stacks ni mensajes SQL al cliente
- ✅ **Swagger** auto-generado con ejemplos y respuestas de error documentadas
- ✅ **Pool de conexiones** compartido (max 20) en lugar de una conexión por request
- ✅ **PM2** con `ecosystem.config.js` listo para producción

---

## Módulos migrados

| Módulo | Prefijo | Descripción |
|--------|---------|-------------|
| `ValrepModule` | `/api/v1/valrep` | Planes, ciudades, estados, categorías, cotización RCV |
| `InmaModule` | `/api/v1/inma` | Marcas, modelos, versiones, categorías de uso por vehículo |
| `ClientModule` | `/api/v1/client` | Búsqueda de clientes y pólizas por cédula/RIF |
| `EmissionsModule` | `/api/v1/emissions` | Búsqueda de vehículos, validación persona/auto, emisión de póliza |
| `ChangesModule` | `/api/v1/changes` | Actualización de datos de clientes en cascada |

---

## Endpoints

> Documentación interactiva completa en **`http://<host>:3001/docs`**

### Valrep

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET`  | `/api/v1/valrep/matipos` | Tipos de vehículo (matipos) |
| `GET`  | `/api/v1/valrep/states` | Estados de Venezuela |
| `GET`  | `/api/v1/valrep/cities?cestado=1` | Ciudades (filtrables por estado) |
| `POST` | `/api/v1/valrep/macategtr` | Categorías de uso por tipo de vehículo |
| `POST` | `/api/v1/valrep/planes/v2` | Planes disponibles + parentescos + coberturas |
| `POST` | `/api/v1/valrep/cotizacion` | Prima RCV (`spCalculoAuto`) en USD y Bs |

### INMA

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET`  | `/api/v1/inma/anios` | Rango de años disponibles en VInma |
| `POST` | `/api/v1/inma/marcas` | Marcas por año |
| `POST` | `/api/v1/inma/marca/:ctipo` | Marcas por año **y** tipo de vehículo |
| `POST` | `/api/v1/inma/modelo` | Modelos por año + marca |
| `POST` | `/api/v1/inma/version` | Versiones + tipo + pasajeros + valor |
| `POST` | `/api/v1/inma/categorias-uso` | Categorías de uso para un vehículo concreto |

### Client

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/client/search/:cci_rif` | Datos completos del cliente |
| `GET` | `/api/v1/client/search/policies/:cci_rif` | Pólizas del asegurado (`spGetPolizasAsegurado`) |

### Emissions

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/emissions/automobile/vehicle` | Buscar vehículo por placa |
| `POST` | `/api/v1/emissions/automobile/serial` | Buscar vehículo por serial de carrocería |
| `POST` | `/api/v1/external/validateEmissionPerson` | Validar persona (`speeValidatePersonGeneral`) |
| `POST` | `/api/v1/external/validateEmissionAuto` | Validar automóvil (`speeValidateAutomovilGeneral`) |
| `POST` | `/api/v1/external/createEmissionAuto` | **Emitir póliza RCV** — requiere header `apikey` |

### Changes

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/changes/client` | Actualizar datos de cliente en cascada |

---

## Formato de respuestas

### Éxito

```json
{
  "status": true,
  "data": { ... }
}
```

### Error de validación (400)

```json
{
  "status": false,
  "statusCode": 400,
  "message": ["fano must not be less than 1950", "cplan debe ser uno de: RCVBAS, RUSPAT, ..."],
  "path": "/api/v1/valrep/cotizacion",
  "timestamp": "2026-05-14T16:36:20.614Z"
}
```

### Error de negocio — SP rechaza (200 con status: false)

```json
{
  "status": false,
  "result": {
    "status": false,
    "error": "Se ha detectado la existencia de una póliza vigente con el mismo asegurado y ramo."
  }
}
```

### Error interno (500)

```json
{
  "status": false,
  "statusCode": 500,
  "message": "Ha ocurrido un error inesperado en el servidor.",
  "path": "/api/v1/...",
  "timestamp": "2026-05-14T16:36:20.614Z"
}
```

---

## Requisitos previos

- **Node.js** 20+
- **npm** 10+
- **PM2** instalado globalmente (`npm i -g pm2`) — solo para producción
- Acceso a SQL Server (Sis2000) por red

---

## Inicio rápido (desarrollo)

```bash
# 1. Clonar
git clone https://github.com/jsotoexelixitech/server-api-sys.git
cd server-api-sys

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con las credenciales de la base de datos

# 4. Levantar en modo watch
npm run start:dev
```

La API queda disponible en `http://localhost:3001/api`  
Swagger UI en `http://localhost:3001/docs`

---

## Variables de entorno

Copia `.env.example` como `.env` y completa los valores:

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | `3001` | Puerto del servidor |
| `NODE_ENV` | `development` | `development` \| `production` |
| `SWAGGER_PATH` | `docs` | Ruta del Swagger UI. Vacío (`''`) lo deshabilita |
| `SERVER_BD` | — | IP o hostname del SQL Server |
| `NAME_BD` | — | Nombre de la base de datos |
| `USER_BD` | — | Usuario SQL |
| `PASSWORD_BD` | — | Contraseña SQL |
| `MSSQL_REQUEST_TIMEOUT` | `300000` | Timeout de queries en ms |
| `MSSQL_ENCRYPT` | `false` | Cifrado TLS con el servidor SQL |
| `MSSQL_TRUST_SERVER_CERTIFICATE` | `true` | Aceptar certificado auto-firmado |
| `CORS_ORIGIN` | `*` | Orígenes CORS permitidos (coma-separados o `*`) |

---

## Despliegue con PM2

### Primera vez o después de cualquier actualización

```bash
# Desde la carpeta del proyecto en el servidor
bash deploy.sh
```

El script hace todo en orden:
1. `npm install` — instala dependencias
2. `npm run build` — compila TypeScript → `dist/`
3. `pm2 startOrRestart ecosystem.config.js --env production` — inicia o reinicia sin downtime
4. `pm2 save` — persiste la lista de procesos

### Arranque automático al reiniciar el servidor (solo una vez)

```bash
pm2 startup
# Ejecuta el comando exacto que PM2 indique, luego:
pm2 save
```

### Comandos útiles

```bash
pm2 logs sysip-nest-api     # logs en tiempo real
pm2 monit                   # monitor CPU/RAM
pm2 status                  # estado de todos los procesos
pm2 restart sysip-nest-api  # reiniciar
pm2 stop sysip-nest-api     # detener
```

Los logs van a `./logs/out.log` y `./logs/error.log`.

---

## Estructura del proyecto

```
server-api-sys/
├── src/
│   ├── main.ts                         ← Bootstrap, Swagger, ValidationPipe
│   ├── app.module.ts                   ← Módulo raíz
│   ├── config/
│   │   └── env.validation.ts           ← Validación Joi de variables de entorno
│   ├── common/
│   │   ├── filters/
│   │   │   └── all-exceptions.filter.ts   ← Errores uniformes, nunca filtra SQL/stacks
│   │   ├── interceptors/
│   │   │   └── response.interceptor.ts    ← Envelope { status, data }
│   │   └── swagger/
│   │       └── api-error-responses.ts     ← Decoradores @ApiCommonErrors, @Api400…
│   ├── database/
│   │   ├── database.module.ts          ← Pool global mssql (@Global)
│   │   └── mssql.service.ts
│   └── modules/
│       ├── valrep/                     ← Planes, ciudades, cotización
│       ├── inma/                       ← Marcas, modelos, versiones
│       ├── client/                     ← Búsqueda de clientes y pólizas
│       ├── emissions/                  ← Validación y emisión de pólizas
│       └── changes/                   ← Actualización de datos de clientes
├── .github/
│   ├── workflows/ci.yml               ← CI: type-check en cada push/PR
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── PULL_REQUEST_TEMPLATE.md
├── .env.example                       ← Plantilla de variables de entorno
├── ecosystem.config.js                ← Configuración PM2
├── deploy.sh                          ← Script de despliegue
├── nest-cli.json
├── package.json
├── tsconfig.json
├── CHANGELOG.md
├── CONTRIBUTING.md
└── LICENSE
```

---

## Diferencias vs. el Express original

| Aspecto | Express (original) | Este proyecto (NestJS) |
|---------|-------------------|-----------------------|
| SQL injection | Template strings `${}` | Queries parametrizadas con `req.input()` |
| Validación de entrada | Ninguna | `class-validator` — 400 con mensaje claro |
| Errores crudos | Mensajes SQL al cliente | Mensajes amigables, stacks solo en logs |
| Pool de conexiones | Una conexión por request | Pool compartido (max 20) |
| `catch {}` vacíos | Varios — devolvían `undefined` | Eliminados, todo con Logger estructurado |
| Stored procedures | `NVarChar(6)` para mensajes | `NVarChar(500)`, leídos y logueados |
| Documentación | Sin documentar | Swagger con ejemplos y códigos de error |
| Despliegue | Manual | `bash deploy.sh` + PM2 |

---

## Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir un PR.

---

## Licencia

[MIT](LICENSE) © 2026 Exelixitech
