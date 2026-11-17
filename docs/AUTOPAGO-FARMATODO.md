# Autopago retail — Integración de venta en caja (Farmatodo)

Especificación de los servicios que expone **nest-api** para vender seguros de La Mundial en caja
(POS) y que el cliente emita su póliza desde un enlace que recibe por correo.

- Protocolo: **REST / JSON sobre HTTPS** (TLS). No requiere VPN; opcionalmente se restringe por IP de origen.
- Codificación: `application/json; charset=utf-8`.
- Consola Swagger: `https://{servidor}/nest-api-docs/docs` (sección *14. Autopago retail*).
- Ambientes: **QA** `https://nexusqa.exelixitech.com/nest-api-docs` · **Producción** por definir con infra.

## Autenticación

Cada integrador recibe una **API key** (`nest_…`) asociada a su canal de venta en Sis2000. Se envía en
todas las peticiones con el header `apikey: nest_…`, o se canjea por un Bearer token:

```http
POST /api/v1/auth/token
{ "grant_type": "api_key", "apikey": "nest_…" }
→ { "access_token": "…", "refresh_token": "…" }
```

La key necesita el permiso `autopago:write`.

## Flujo

1. **Caja (POS):** el cliente paga y deja cédula, nombre, correo y teléfono.
2. **API 2 · Registrar venta:** el POS envía la factura y los SKU vendidos. nest-api crea **un enlace de
   emisión por unidad** y lo envía al correo del cliente (un correo por póliza).
3. **Auto-emisión:** el cliente abre el enlace, carga sus documentos (OCR), confirma los datos y la póliza
   se emite en el core sin paso de cobro (la factura de caja es el pago).
4. **Token quemado:** al emitir, el enlace queda inactivo. Si se vuelve a abrir, muestra que la póliza ya
   fue emitida.

## API 1 · Catálogo de productos del canal

```http
GET /api/v1/autopago/productos
apikey: nest_…
```

Respuesta:

```json
{
  "status": true,
  "data": {
    "ccanalalt": 8,
    "cantidad": 2,
    "productos": [
      { "csku": "12444564", "cproducto": "23", "cramo": 18, "cplan": "FARMPA",
        "xproducto": "RCV Particular", "xplan": "Plan Farmatodo", "tipo_formulario": "rcv", "mmonto": null },
      { "csku": "12884568", "cproducto": "57", "cramo": 45, "cplan": "FUNESP",
        "xproducto": "Funerario CA", "xplan": "Plan 1.000$ Funerario CA", "tipo_formulario": "personas", "mmonto": null }
    ]
  }
}
```

Los SKU salen de la configuración de La Mundial (`taprodsku` por canal). El POS solo maneja `csku`;
el ramo y el plan se homologan del lado asegurador.

## API 2 · Registrar venta en caja

```http
POST /api/v1/autopago/ventas
apikey: nest_…
Content-Type: application/json
```

| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| `tipo_persona` | `V` `E` `J` `G` `P` | Sí | Tipo de documento del cliente |
| `cci_rif` | string(4–15) | Sí | Cédula / RIF sin letra ni puntos (pasaporte alfanumérico) |
| `xcliente` | string(100) | Sí | Nombre y apellido o razón social |
| `xcorreo` | email | Sí | Destino de los enlaces de emisión |
| `xtelefono` | string(20) | No | Teléfono de contacto |
| `nfactura` | string(20) | Sí | Factura fiscal. **Única por canal**: repetirla devuelve el registro existente |
| `fventa` | ISO 8601 | No | Fecha/hora de la venta (por defecto, la de recepción) |
| `xsucursal` | string(250) | No | Tienda o caja |
| `mmonto` / `cmoneda` | number / `$` `Bs` | No | Total cobrado (conciliación) |
| `productos[]` | array(1–20) | Sí | `{ csku, ncantidad (1–20, def. 1), mmonto? }` |

Ejemplo:

```json
{
  "tipo_persona": "V",
  "cci_rif": "18459203",
  "xcliente": "Carlos Eduardo Mendoza",
  "xcorreo": "carlos.mendoza@email.com",
  "xtelefono": "+584121234567",
  "nfactura": "4829104851",
  "fventa": "2026-10-26T14:30:00Z",
  "xsucursal": "Farmatodo Las Mercedes",
  "productos": [
    { "csku": "12444564", "ncantidad": 1 },
    { "csku": "12884568", "ncantidad": 2 }
  ]
}
```

Respuesta `200 OK`:

```json
{
  "status": true,
  "message": "Transacción registrada exitosamente",
  "data": {
    "codigo_registro": "AP-000012",
    "nfactura": "4829104851",
    "ccanalalt": 8,
    "fventa": "2026-10-26T14:30:00.000Z",
    "yaRegistrada": false,
    "emisiones_autorizadas": 3,
    "emisiones_pendientes": 3,
    "emisiones": [
      { "ncorrelativo": 1, "csku": "12444564", "xproducto": "RCV Particular", "tipo_formulario": "rcv",
        "iestado": "P", "xestado": "Pendiente",
        "url_emision": "https://…/ocr/tarjeta?ap=Qm1xZ…", "expires_at": "2026-11-25T14:30:00.000Z", "cnpoliza": null },
      { "ncorrelativo": 2, "csku": "12884568", "xproducto": "Funerario CA", "tipo_formulario": "personas",
        "iestado": "P", "xestado": "Pendiente", "url_emision": "https://…/ocr/tarjeta?ap=7hJk…", "expires_at": "…", "cnpoliza": null },
      { "ncorrelativo": 3, "csku": "12884568", "…": "…" }
    ],
    "correo": { "destinatario": "carlos.mendoza@email.com", "enviados": 3, "pendientes": 3, "errores": [] }
  }
}
```

Errores:

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | — | Validación de campos (`message` lista los campos) |
| 401 | — | API key ausente o inválida |
| 403 | — | La key no tiene `autopago:write` |
| 422 | `SKU_NO_CONFIGURADO` | Algún `csku` no está configurado para el canal (`data.csku` los lista) |

## Consultas complementarias

| Método y ruta | Uso |
|---|---|
| `GET /api/v1/autopago/ventas/{nfactura}` | Estado de la venta: emisiones pendientes / emitidas con su `cnpoliza` |
| `POST /api/v1/autopago/emisiones/{token}/reenviar` | Reenvía el correo de un enlace pendiente |

## Internos (no los usa el POS)

| Método y ruta | Quién | Uso |
|---|---|---|
| `GET /api/v1/autopago/emisiones/{token}` | Flujo web de emisión (público; el token es el secreto) | Datos de la compra para abrir el flujo sin cobro. 409 si ya se emitió, 410 si venció |
| `POST /api/v1/autopago/emisiones/{token}/emitida` | emision-api | Marca el enlace como emitido (token quemado) |

## Configuración (nest-api `.env`)

```env
AUTOPAGO_EMISION_URL=https://cierrelmds.exelixitech.com/ocr/tarjeta   # base del enlace (121: nexusqa)
AUTOPAGO_TOKEN_TTL_DIAS=30
# AUTOPAGO_CCANALALT=8            # canal si la API key no tiene ccanalalt
# AUTOPAGO_SKU_MAP={"FARMPA":{"cramo":18,"cplan":"FARMPA","xproducto":"RCV Particular","tipo_formulario":"rcv"}}
MAIL_ENABLED=true                 # sin esto se generan los enlaces pero no se envía el correo
```

Las ventas se guardan en Postgres (`NEST_PG_DATABASE_URL`, tablas `nest_auth.autopago_venta` y
`nest_auth.autopago_venta_item`, ver `docs/sql/postgres/autopago-init.sql`). Sin Postgres, nest-api las
guarda en memoria solo para pruebas locales.
