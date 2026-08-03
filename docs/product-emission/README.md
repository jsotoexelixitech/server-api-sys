# product-emission — Emisión genérica multi-ramo (NUEVO, AISLADO)

Flujo nuevo e **independiente** de los módulos activos de La Mundial
(`emissions`, `personas`, `collection`, `external`, Sis2000/mssql).

Usa como catálogo los ramos/planes/coberturas creados en
`proyecto-product-builder` (vía su API HTTP, solo lectura) y genera el
cuadro-póliza en `.docx`, guardando la póliza en una **base de datos propia**.

## Garantías de aislamiento

| Recurso | La Mundial (existente) | product-emission (nuevo) |
|---|---|---|
| Base de datos | Sis2000 (mssql) + Postgres `nest_api` esquema `nest_auth` | Postgres **propia** (`PRODUCT_EMISSION_DATABASE_URL`) |
| Cliente Prisma | `@prisma/client` (`prisma/schema.prisma`) | Cliente generado aparte en `generated/product-emission-client` (`prisma-product-emission/schema.prisma`) |
| Módulos Nest | `EmissionsModule`, `PersonasModule`, `CollectionModule`, `ExternalModule`, etc. | `ProductEmissionModule` (no los importa, no los usa) |
| Rutas | `/api/v1/emissions/*`, `/api/v1/personas/*`, ... | `/api/v1/product-emission/*` |
| Catálogo | Sis2000 (`maramos`, `maplanes`, etc.) | HTTP a `proyecto-product-builder` (`PRODUCT_BUILDER_API_URL`) |

Si `PRODUCT_EMISSION_DATABASE_URL` no está configurado (o no se generó el
cliente), el módulo sigue generando el documento pero **no persiste** la
póliza — nunca rompe el arranque de nest-api ni afecta otros módulos.

## 1. Levantar la BD propia de product-emission (local)

```powershell
cd backend-api-sys/nest-api
docker compose -f docker-compose.product-emission.yml up -d
```

Esto crea un Postgres nuevo en el puerto **5433** (distinto al de
`proyecto-product-builder`, que usa 5432).

En `.env` de nest-api:

```
PRODUCT_EMISSION_DATABASE_URL=postgresql://product_emission:product_emission_dev@localhost:5433/product_emission?schema=public
PRODUCT_BUILDER_API_URL=http://localhost:3001
PRODUCT_BUILDER_API_EMAIL=nest-api@exelixitech.com
PRODUCT_BUILDER_API_PASSWORD=CambiarEstaClave123!
```

Generar cliente + aplicar migraciones (solo la primera vez / tras cambios de schema):

```powershell
npm run prisma:generate:product-emission
npm run prisma:migrate:product-emission
```

## 2. Levantar proyecto-product-builder

```powershell
cd C:\Users\javier.soto\Desktop\proyecto-product-builder
docker compose up -d          # Postgres propio de product-builder (5432) — o usar Postgres nativo local
cd server-api
npm install
npx prisma migrate dev
npm run start:dev             # queda en http://localhost:3001, prefijo global "/api"
```

> **Importante:** todas las rutas van bajo `/api` (`app.setGlobalPrefix('api')`
> en `main.ts`) y **exigen JWT Bearer**, incluso para leer (`GET /api/products/:id`).
> nest-api necesita una cuenta de servicio (`PRODUCT_BUILDER_API_EMAIL` /
> `PRODUCT_BUILDER_API_PASSWORD`) para poder consultar el catálogo — ver
> `ProductBuilderClient` (login automático + caché de token, reintento en 401).

Crear un usuario de servicio y un producto de prueba (ramo RCV):

```powershell
# 0) Crear/loguear usuario de servicio (guardar el accessToken)
curl -X POST http://localhost:3001/api/auth/signup -H "Content-Type: application/json" -d '{
  "email": "nest-api@exelixitech.com",
  "password": "CambiarEstaClave123!",
  "fullName": "nest-api service account"
}'
# → usar el "accessToken" de la respuesta como $TOKEN en los pasos siguientes
# (o /api/auth/login si el usuario ya existe)

# 1) Crear producto
curl -X POST http://localhost:3001/api/products \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{
  "commercialName": "RCV Obligatorio 2026",
  "internalCode": "RCV2026",
  "branch": "RCV_OBLIGATORIO",
  "currency": "USD",
  "emissionType": "EMISION_GARANTIZADA"
}'
# → copiar el "id" devuelto (productId)
# emissionType válidos: EMISION_GARANTIZADA | REQUIERE_DECLARACION_SALUD | REQUIERE_INSPECCION

# 2) Cargar coberturas
curl -X PUT http://localhost:3001/api/products/<productId>/coverages \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{
  "coverages": [
    { "name": "RCV Danos a terceros", "isBasicMandatory": true, "insuredSumFixed": 15000, "tariffPremium": 125.50, "sortOrder": 0 }
  ]
}'
# → copiar el "id" de la cobertura devuelta (coverageId)

# 3) Cargar plan (priceFactor = prima total del plan)
curl -X PUT http://localhost:3001/api/products/<productId>/plans \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{
  "plans": [
    { "name": "Plan RCV Obligatorio", "priceFactor": 125.50, "isRecommended": true, "coverageIds": ["<coverageId>"], "sortOrder": 0 }
  ]
}'
```

## 3. Levantar nest-api con product-emission

```powershell
cd backend-api-sys/nest-api
npm run start:dev
```

Rutas nuevas (Swagger: `http://localhost:3002/docs`, tag **"10. Emisión
genérica (product-builder)"**):

- `POST /api/v1/product-emission/quote` — cotiza (no persiste).
- `POST /api/v1/product-emission/validate` — valida antes de emitir.
- `POST /api/v1/product-emission/emit` — emite, genera el `.docx` y guarda en BD.
- `GET /api/v1/product-emission/policies/:numeroPoliza` — consulta póliza.
- `GET /api/v1/product-emission/documents/:filename` — descarga el documento.

Si `NEST_AUTH_ENABLED=true` (default), estas rutas requieren `apikey` o
Bearer con scope `product-emission:write` (nuevo scope, ver
`nest-auth-scopes.constants.ts`). Para pruebas locales rápidas se puede
poner `NEST_AUTH_ENABLED=false` en `.env`.

## 4. Probar la emisión end-to-end

```powershell
curl -X POST http://localhost:3002/api/v1/product-emission/emit -H "Content-Type: application/json" -H "apikey: <tu-api-key>" -d '{
  "productId": "<productId>",
  "tomador": { "nombre": "ANA ANGELINA JIMENEZ DE MONAGAS", "identificacion": "V-7716530" },
  "asegurado": { "nombre": "ANA ANGELINA JIMENEZ DE MONAGAS", "identificacion": "V-7716530" },
  "riskData": { "Placa": "AB123CD", "Marca": "Toyota", "Modelo": "Corolla" }
}'
```

Respuesta esperada:

```json
{
  "persisted": true,
  "numeroPoliza": "RCV-2026-00000001",
  "ramoPoliza": "RCV",
  "productName": "RCV Obligatorio 2026",
  "planName": "Plan RCV Obligatorio",
  "primaTotal": 125.5,
  "moneda": "USD",
  "documentUrl": "https://cierrelmds.exelixitech.com/nest-api-docs/api/v1/product-emission/documents/poliza_RCV-2026-00000001.docx"
}
```

Abrir `documentUrl` (o el filename en `temp-product-emission-docs/`
localmente) descarga el cuadro-póliza con el **RAMO PÓLIZA** dinámico
("RCV", "AUTOMOVIL", "SALUD", según el `branch` del producto creado en
product-builder).

## Notas de diseño

- El título "RAMO PÓLIZA" del documento se resuelve en
  `product-branch-labels.util.ts` a partir del `branch` del producto en
  product-builder (RCV_OBLIGATORIO → "RCV", AUTOMOVIL → "AUTOMOVIL", etc.).
- Las coberturas y el plan vienen 100% del catálogo de product-builder — no
  hay ningún dato hardcodeado de La Mundial/Sis2000.
- "Datos del riesgo" es una sección genérica (clave/valor) que aplica para
  cualquier ramo (vehículo, salud, patrimonial, etc.) sin necesitar código
  específico por ramo.
- El documento se genera con la librería `docx` (Node, sin dependencias
  nativas) — no requiere LibreOffice ni Word instalados. Se entrega en
  `.docx` (editable/imprimible). Si más adelante se requiere PDF exacto, se
  puede añadir una conversión opcional vía LibreOffice headless en el
  servidor, sin tocar el resto del flujo.
