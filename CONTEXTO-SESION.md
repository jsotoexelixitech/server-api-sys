# Contexto de sesión — nest-api (server-api-sys)

> **Última actualización:** 1-ago-2026  
> **Propósito:** handoff entre IDEs (Cursor ↔ Antigravity). Leer **antes** de continuar trabajo en emisión RCV / personas / viajero.

---

## 1. Proyecto y repo

| Campo | Valor |
|-------|--------|
| **Carpeta local** | `c:\Users\javier.soto\Desktop\all-projects\backend-api-sys\nest-api\` |
| **Git** | Solo esta carpeta es repo (`server-api-sys`) |
| **Remote** | `https://github.com/jsotoexelixitech/server-api-sys.git` |
| **Rama** | `main` |
| **HEAD local** | `778a534` — *fix(scripts): verify-scopes-flow* |
| **Servidor QA** | srv001 · `192.168.8.120:3002` · PM2 `sysip-nest-api` |
| **Deploy** | `cd ~/server-api-sys && git pull && npm run build && pm2 restart sysip-nest-api` |
| **Swagger (red interna)** | `http://192.168.8.120:3002/docs` |
| **Swagger (HTTPS cierrelmds)** | `https://cierrelmds.exelixitech.com/api-docs-nest-api/docs` |
| **BD** | SQL Server Sis2000 — `sis2000_qa` en `172.30.149.67` |

**Express legacy** (`backend-api-sys/src/`) existe pero el desarrollo activo de La Mundial API es **nest-api**.

---

## 2. Herramientas obligatorias (igual que Cursor)

### Navegación de código — EN ORDEN

1. **ctags** — `grep -m5 "Simbolo" c:\Users\javier.soto\Desktop\all-projects\tags`
2. **ripgrep** — `rg -m5 "texto" --glob "!node_modules/**" --glob "!dist/**" --glob "!build/**"`
3. **Lectura directa** — solo si 1 y 2 fallan; máx. 2 archivos por tarea

**NO usar:** MCP `code-rag` (desactivado — CPU 100%).

Tras refactors grandes: `.\update-tags.ps1` en la raíz de `all-projects`.

### Reglas del workspace (leer si existen)

| Archivo | Contenido |
|---------|-----------|
| `all-projects/.cursor/rules/00-token-efficiency.mdc` | Protocolo ctags + rg |
| `all-projects/.cursor/rules/01-workspace-map.mdc` | Mapa proyectos |
| `all-projects/.cursor/rules/02-coding-standards.mdc` | Estándares código/commits |
| `all-projects/.cursor/rules/03-server-deploy.mdc` | srv001 + deploy |
| `all-projects/.cursor/rules/04-collection-rcv-frozen.mdc` | **Cobro RCV congelado — no tocar** |

### Antigravity

| Archivo | Rol |
|---------|-----|
| `HISTORIAL-CHATS.md` (raíz all-projects) | Resumen **todos** los chats Cursor (6 sesiones) |
| `SETUP-ANTIGRAVITY.md` (raíz all-projects) | Guía instalación paridad Cursor |
| `.agents/skills/README.md` | 7 skills sincronizados Cursor ↔ Antigravity |
| `AGENTS.md` + `GEMINI.md` (raíz all-projects) | Reglas workspace |
| `.agents/rules/` | Reglas modulares (ctags, deploy, nest-api…) |
| `backend-api-sys/.antigravity/backend_agent.md` | Agente back |
| `backend-api-sys/.antigravity/database_agent.md` | Agente BD |
| `~/.gemini/GEMINI.md` + `mcp_config.json` | Global usuario + Context7 MCP |
| `Desktop/antigravity_projects.json` | Rutas multi-proyecto |

**Abrir folder:** `all-projects` (no solo `nest-api`).

**La Mundial (solo lectura):** `proyecto de la mundial no tocar solo investigacion/` — consultar sí, modificar solo con aprobación explícita.

---

## 3. Estado de la sesión (1-ago-2026)

### 3.1 Viajero (producto 26, ramo 5) — validado QA 27-jul-2026

> **Handoff Antigravity:** esta sección es la fuente de verdad del catálogo viajero. Actualizar aquí tras nuevas pruebas en srv001.

#### Resumen

- **No** hay módulo ni SP de emisión propio: reutiliza **personas/funerario** (`spCalculoPer`, `sp_pre_emision_personas_general_nexus`).
- **Ramo 5** = accidentes personales / viajero internacional por días. **No confundir** con ramo **25** (viajero local, mismos códigos `VIAJE1`/`VIAJE2` en catálogo).
- **Producto Sis2000:** `cproducto = "26"`. **Moneda plan:** `$` (USD). **Suma:** 1.500 USD.
- **srv001 (27-jul):** desplegada rama **`feat/valrep-canal-vida-viajero`** (endpoints `frecuencia/detalle`, `planes/por-dias`). Merge a `main` pendiente.

#### Emisión — reglas de negocio (QA)

| Regla | Detalle |
|-------|---------|
| Roles | Solo **tomador** + **asegurado** (sin beneficiarios en viajero corto). |
| Payload emisión | Bloques completos `tomador`, `titular` (= asegurado que viaja), array `asegurados[]`, `beneficiarios: []`. |
| Prima en nest | Campo `prima` del body → SP como **`mprimaext`** (USD). Usar `mprimaext` de cotización, no `mprima` en Bs. |
| Vigencia | `fhasta = fdesde + (ndias - 1)`. **Obligatorio** en emisión (default del servicio = +1 año). |
| Frecuencia | Siempre **`E`** (ÚNICA) en planes operativos 3–15 días. |
| maclient | Si el RIF **ya existe** en QA, el recibo muestra **nombre/fnac de `maclient`**, no del JSON. Usar RIF nuevos en pruebas o actualizar ficha en BD. |
| Póliza vigente | Mismo asegurado + ramo 5 → error *"póliza vigente con el mismo asegurado y ramo"*. |

#### Catálogo — listar planes (curl oficial)

```bash
# ÚNICO body que lista producto 26 en QA (27-jul-2026)
curl -s -X POST "http://127.0.0.1:3002/api/v1/valrep/planes/producto" \
  -H "Content-Type: application/json" \
  -d '{"cproducto":"26","centidad":"P","citem":"80080"}'
```

| Body | Resultado |
|------|-----------|
| `centidad:"P"`, `citem:"80080"` | OK — lista completa |
| `centidad:"C"`, `citem:"80080"` | **400** — sin filas en `mausuplan` para canal C |
| Solo `cproducto:"26"` | **400** |

**Nota:** `POST /valrep/productos` con `C/80080` **no incluye** el producto 26 (devuelve 57, 24, 77, 58, 78). El viajero se descubre vía `planes/producto` + `P/80080`.

**Front Exélixi:** filtrar respuesta por **`cramo === 5`**. Ignorar entradas **`cramo: 25`** (`VIAJE1`, `VIAJE2` local).

#### Tabla planes producto 26 — ramo 5 (operativos vs pendientes)

| cplan | xplan (resumen) | Días | Frecuencia (`frecuencia/detalle`) | Cotización QA | Emisión |
|-------|-----------------|------|-----------------------------------|---------------|---------|
| `VIAJE1` | Plan I Viajero **Local** | — | **Sin filas** (`[]` / 400 en `/frecuencia`) | No probado | **No operativo** vía API estándar |
| `VIAJE4` | Viajero 3 días | 3 | `E`, ndias: 3 | ~2,25 USD / 1.670 Bs | OK |
| `VIAJE5` | 4 días | 4 | `E`, ndias: 4 | OK | OK |
| `VIAJE6` | 5 días | 5 | `E`, ndias: 5 | OK | OK |
| `VIAJE7` | 6 días | 6 | `E`, ndias: 6 | ~4,50 USD / 3.340 Bs | OK |
| `VIAJE8` | 7 días | 7 | `E`, ndias: 7 | OK | OK |
| `VIAJE9` | 8 días | 8 | `E`, ndias: 8 | OK | OK |
| `VIAJ10` | Viajero **15 días** | 15 | `E`, **`ndias: null`** | ~11,25 USD / 8.350 Bs | OK — `fhasta = fdesde + 14` |

**Regla numérica:** en `VIAJE4`–`VIAJE9`, `ndias ≈ número del plan − 1` (ej. `VIAJE7` → 6 días).

**Excluir del flujo Exélixi (ramo 25):** `VIAJE1`, `VIAJE2` — aparecen en el mismo JSON de `planes/producto` con `cramo: 25`.

#### Flujo API recomendado (elegir plan por código, no por días)

```
1. planes/producto   { cproducto:"26", centidad:"P", citem:"80080" }
2. Filtrar cramo === 5; excluir VIAJE1 (sin frecuencia)
3. Usuario elige cplan (ej. VIAJE7)
4. frecuencia/detalle { cplan, cramo:5 }  → ifrecuencia "E" + ndias
5. planes/detalle     { cramo:5, cplan }    → (opcional) coberturas, parentescos
6. personas/cotizacion { cramo:5, cplan, ifrecuencia:"E", asegurados[] }
7. personas/validacion { plan, cramo:5, femision, rif_titular, fnac_titular }
8. personas/emision    { plan, frecuencia:"E", fdesde, fhasta, prima (USD), tomador, titular, asegurados[] }
```

**No usar como flujo principal:** `POST /valrep/planes/por-dias` — atajo legacy SysIP (UI elige fechas → resuelve `cplan`). Fuera de 3–8 devuelve fallback `cplan:"1"` con `ndias:null`.

#### Curls de referencia (srv001)

```bash
BASE="http://127.0.0.1:3002"

# Frecuencia de un plan elegido
curl -s -X POST "$BASE/api/v1/valrep/frecuencia/detalle" \
  -H "Content-Type: application/json" \
  -d '{"cplan":"VIAJE7","cramo":5}'

# Cotización
curl -s -X POST "$BASE/api/v1/personas/cotizacion" \
  -H "Content-Type: application/json" \
  -d '{"cramo":5,"cplan":"VIAJE7","ifrecuencia":"E","asegurados":[{"cparen":1,"xrif_asegurado":"18765432","nedad_asegurado":35}]}'

# Validación (RIF del asegurado/titular)
curl -s -X POST "$BASE/api/v1/personas/validacion" \
  -H "Content-Type: application/json" \
  -d '{"cramo":5,"plan":"VIAJE7","femision":"2026-07-27","rif_titular":18765432,"fnac_titular":"1991-01-15"}'
```

Emisión: usar JSON en archivo (`/tmp/emision-viajero.json`) — ver prueba `5-1-1000000680` (VIAJE4, tomador ≠ asegurado).

#### Endpoints alternativos (alias legacy)

| Exélixi (sin apikey QA) | Legacy external |
|-------------------------|-----------------|
| `POST /personas/cotizacion` | `POST /external/getCotizacionPer` |
| `POST /personas/validacion` | `POST /external/validateEmissionPerson` |
| `POST /personas/emision` | `POST /external/createEmissionPerson` |

Referencia front legacy: `SysIP/.../receipt-viajero-local-form.component.ts`, `viajero.component.ts` (producto vía query `cproducto`, emisión `person`).

### 3.2 Consultas BD pólizas

- Listar pólizas por ramo → **`adpoliza`** (cabecera), no `adpoltar`.
- `adpoltar` = detalle tarifas/coberturas por recibo (filas múltiples).
- Ejemplo explorado: `cnpoliza = 101000156610`, `cramo = 10`.

### 3.3 Rollback de emisión — ELIMINADO (en código main)

**Decisión:** emisión **solo** vía SP Nexus; sin override `.env` al legacy.

| Antes | Ahora |
|-------|--------|
| `SP_PRE_EMISION_AUTO_RCV` en `.env` | Eliminado de `env.validation.ts` |
| `SP_PRE_EMISION_PERSONAS_GENERAL` en `.env` | Eliminado |
| Constantes `*_LEGACY` | Eliminadas |
| Swagger “rollback: …” | Limpiado |

**Fuente de verdad SP:** `src/config/sis2000-sp.constants.ts`

```typescript
SP_PRE_EMISION_AUTO_RCV    = 'sp_pre_emision_automovil_rcv_nexus'
SP_EMISION_AUTO_RCV        = 'sp_emision_automovil_rcv_nexus'
SP_PRE_EMISION_PERSONAS    = 'sp_pre_emision_personas_general_nexus'
SP_EMISION_PERSONAS        = 'sp_emision_personas_general_nexus'
SP_CALCULO_VIAJERO_PRORRATA = 'spCalculoViajeroProrrata'
```

**Pendiente opcional (no hecho):** eliminar `EMISSION_SOURCE=external` (RCV por HTTP a La Mundial en lugar de SP local). Sigue en `emissions.service.ts`; default = `local`.

### 3.4 Partner SDK y scopes OAuth

| Recurso | Ubicación |
|---------|-----------|
| Publicar SDK npm | `docs/partner/GITHUB-PACKAGES.md` |
| Template integrador | `docs/partner/partner-api-starter-template/` |
| Paquete | `@jsotoexelixitech/nest-api-sdk` (GitHub Packages) |
| E2E scopes | `scripts/verify-scopes-flow.sh` |

En srv001: `.env` con `PARTNER_PACKAGES=@ORG/partner-api-xxx` (no en `ecosystem.config.js`).

### 3.5 Archivos locales sin commit (1-ago-2026)

```
docs/partner/partner-api-starter-template.zip (+ archivos template)
docs/sql/consulta-ramo-interno.sql, consulta-ramos-planes.sql, spBuscaPlanesRamoInterno.sql
scripts/consulta-ramos-planes.sh
```

**Acción:** commit + push cuando el usuario lo pida.

---

## 4. SPs activos (sin legacy) — inventario A→Z

### Emisión RCV (cadena)

```
speeValidateAutomovilGeneral
  → sp_pre_emision_automovil_rcv_nexus
      → spCreateInmaItem, sp_contador_nexus
      → sp_emision_automovil_rcv_nexus
          → spCreateMaclient, spGeneraCoberturasYRecibos_Auto_RCV2
              → spCalculoAuto, adBCalcula_NumContad, spGeneraAdpolrea
```

**Catálogo RCV:** `spBuscaPlan`, `spBuscaFrecuenciaPlan`, `spCalculoAuto`  
**Maestros:** `sp_ma_obtener_estados`, `sp_ma_obtener_ciudades`, `sp_ma_obtener_parentescos`, `sp_macat_obtener_valores_dominio`  
**INMA:** SQL directo en `inma.service.ts` (vista `VInma`), sin SP.

### Emisión personas / funerario / viajero (cadena)

```
speeValidatePersonGeneral
  → sp_pre_emision_personas_general_nexus
      → sp_contador_nexus
      → sp_emision_personas_general_nexus
          → spCreateMaclient, spGeneraAdpolrea, spGeneraCoberturasSiniestroPersonas
```

**Catálogo:** `spBuscaProductosEntidad`, `spBuscaPlanProducto`, `spBuscaDetallePlan`, `spBuscaFrecuenciaPlan`, `spGetPlanesPerFunerario`  
**Cotización:** `spCalculoPer` · viajero prorrata: **`spCalculoViajeroProrrata`** (commit `5723c63`)  
**Auth canal:** `spGetMaclientApi`

### Cobranza RCV — CONGELADA (regla 04-collection-rcv-frozen)

```
POST /external/collection/activate
  → spCobroSis_Ad → spUpsertCbreportePago_Ad (cbreporte_pago)
```

Internos en cobro: `adGeneraComision`, `adBCalculo_Bonos`, `adBCalculo_GastoRamov2`, `spOrdenPago`, `adCobroSis_Pas`, `spNotificaPago`, `spCnSaldo_Ad`, `SpMovim`.

**Prueba validada QA:** ingreso #183034 · póliza `18-1-0000078926` · recibo `18-100272044`.

### SPs legacy — NO usados por nest-api (solo referencia en docs/sql/)

- `sp_pre_emision_Automovil_RCV2` / `sp_Emision_Automovil_RCV2`
- `sp_pre_emision_Personas_General` / `sp_emision_Personas_General`

Scripts CREATE en `docs/sql/` (muchos sin trackear en git aún).

---

## 5. Mapa módulos nest-api

| Módulo | Ruta base | Flujo |
|--------|-----------|-------|
| `inma` | `/api/v1/inma` | Catálogo vehículo (SQL) |
| `valrep` | `/api/v1/valrep` | Planes, frecuencias, cotización auto, catálogo funerario |
| `emissions` | `/api/v1` | RCV validate + create |
| `external` | `/api/v1/external` | Personas cotizar/validar/emitir |
| `personas` | `/api/v1/personas` | Personas formato Exélixi |
| `collection` | `/api/v1/external/collection` | Cobro RCV |
| `documents` | `/api/v1/documents` | PDF conductor habitual |
| `client` | `/api/v1/client` | Consultas cliente |

---

## 6. Ramas remotas relevantes

| Rama | Estado | Notas |
|------|--------|-------|
| `main` | Repo local | Sin merge de viajero `frecuencia/detalle` |
| `origin/feat/valrep-canal-vida-viajero` | **srv001 activo (27-jul)** | `planes/por-dias`, `frecuencia/detalle`, `ifrecuencia E/C` en cotización |
| Merge pendiente | — | Integrar feat → `main` + push para no depender de checkout en QA |

---

## 7. Comunicación y convenciones

- Responder **siempre en español**.
- **No commitear** salvo petición explícita del usuario.
- **No modificar** módulo cobranza RCV sin aprobación (regla congelada).
- **No modificar** carpeta La Mundial investigación sin aprobación.
- Sin `console.log` en entrega; sin imports muertos.
- Reporte: commit → notas técnicas → informe ejecutivo.

---

## 8. Pendientes / siguientes pasos sugeridos

1. Mergear `feat/valrep-canal-vida-viajero` → `main` + deploy srv001 estable.
2. DBA: `mausuplan` para producto 26 / planes `VIAJE*` con `centidad:C` + `citem:80080` (hoy solo funciona `P/80080`).
3. DBA: frecuencia en `maplanes_frec` para `VIAJE1` (local) si se requiere en Exélixi.
4. DBA: cargar `ndias: 15` en `maplanes_frec` para `VIAJ10` (hoy `ndias: null`).
5. Desplegar `spCalculoViajeroProrrata` en Sis2000 QA/prod.
6. Commit archivos partner/SQL pendientes (cuando el usuario lo pida).
7. Front Exélixi: catálogo viajero vía `planes/producto` P/80080; filtrar `cramo === 5`.
8. Nexus: verify bloqueo inmediato al desactivar empresa; CORS `siniestros.exelixitech.com`.
9. (Opcional) Rechazar fallback silencioso en `planes/por-dias` cuando no hay match (devolver 400).
10. (Opcional) Eliminar `EMISSION_SOURCE=external` en RCV.

---

## 9. Referencia rápida endpoints

### RCV
```
POST /api/v1/valrep/planes/v2
POST /api/v1/valrep/frecuencia
POST /api/v1/valrep/cotizacion
POST /api/v1/external/validateEmissionAuto
POST /api/v1/external/createEmissionAuto      ← apikey
POST /api/v1/external/collection/activate     ← apikey · CONGELADO
```

### Personas / funerario / viajero
```
POST /api/v1/valrep/productos
POST /api/v1/valrep/planes/producto          ← viajero: cproducto 26, centidad P, citem 80080
POST /api/v1/valrep/planes/detalle
POST /api/v1/valrep/frecuencia/detalle       ← rama feat; confirma E + ndias por cplan
POST /api/v1/valrep/planes/por-dias          ← legacy; no flujo principal Exélixi
POST /api/v1/personas/cotizacion|validacion|emision
POST /api/v1/external/getCotizacionPer         ← apikey (alias legacy)
POST /api/v1/external/validateEmissionPerson
POST /api/v1/external/createEmissionPerson     ← apikey
```

**Catálogo viajero completo:** ver §3.1.
