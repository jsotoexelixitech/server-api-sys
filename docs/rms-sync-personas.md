# Sync personas Sis2000 ↔ RMS (QA)

La póliza nace en Sis2000. Si cambia un lado, el puente actualiza el otro.
Si se cae HTTP, la fila queda `PENDIENTE` en `dbo.sync_persona_rms_nexus` y se drena a mano (sin cron).

El agente **no** ejecuta el SQL. Lo publica DBA/usuario en Sis2000 QA (`NAME_BD` de nest-api).

## 1. Publicar en Sis2000 QA

Script: `docs/sql/sp_sync_persona_rms_nexus.sql`

- Tabla `dbo.sync_persona_rms_nexus` (outbox; no es `#temp` de sesión)
- SP `sp_valida_sync_persona_rms_nexus` (informe FALTA / DISTINTO / CONFLICTO)
- Apply hacia `maclient`: el SP ya existente `sp_cambio_datos_poliza_endoso_nexus`

## 2. nest-api `.env` (QA)

```
RMS_GATEWAY_ENABLED=true
RMS_GATEWAY_BASE_URL=http://127.0.0.1:3033/rms-gateway-services
RMS_GATEWAY_WEBHOOK_SECRET=***
RMS_GATEWAY_API_KEY=***
```

`RMS_GATEWAY_API_KEY` es la parte después de `:` en `RMS_GATEWAY_API_KEYS` del gateway (la `ik_...`). Sirve para `GET /personas`. El webhook sigue usando el secreto.

Deploy nest: `cd ~/server-api-sys && git pull && unset PORT && npm run build && pm2 restart sysip-nest-api`

## 3. Curls (`proyect@srv001qa`)

```bash
unset PORT VITE_APP_BASE DATABASE_URL
KEY=$(grep '^NEST_API_KEY=' ~/exelixi/Emision-Plan-modulo/server/.env | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')

# Informe (no escribe)
curl -s "http://127.0.0.1:3002/api/rms-sync/personas?cnpoliza=7-1-1000002371" \
  -H "apikey: $KEY"

# Validar + aplicar según diff (Sis→RMS y/o RMS→Sis)
curl -s -X POST "http://127.0.0.1:3002/api/rms-sync/personas" \
  -H "apikey: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"cnpoliza":"7-1-1000002371","fanopol":2026,"fmespol":9,"aplicar":true}'

# RMS avisó un cambio de persona
curl -s -X POST "http://127.0.0.1:3002/api/rms-sync/personas/rms" \
  -H "apikey: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"cnpoliza":"7-1-1000002371","fanopol":2026,"fmespol":9,"tipoCambio":"TOMADOR","cci_rif":28511812,"icedula":"V","xcliente":"Jorge Duran QA-SYNC"}'

# Reintentar PENDIENTE (corte de red)
curl -s -X POST "http://127.0.0.1:3002/api/rms-sync/drenar" \
  -H "apikey: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit":20}'
```

El endoso `POST /api/endosos/poliza/datos` ahora inserta outbox `SIS_TO_RMS` **antes** de avisar a RMS. Si el webhook falla, `estado` sigue `PENDIENTE`.

Ramo 18 no se sincroniza. CONFLICTO (ambos cambiaron vs snapshot) no se pisa: queda informado en la tabla.
