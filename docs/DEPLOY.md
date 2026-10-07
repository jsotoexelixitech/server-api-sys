# Despliegue (GitHub Actions + PM2)

Workflow: `.github/workflows/deploy.yml`.

| Rama | Ambiente | Servidor | Runner (etiqueta) | PM2 (`--env`) |
|---|---|---|---|---|
| `main` | `production` | 172.30.149.75 | `produccion` | `production` |
| `qa` | `qa` | 192.168.8.121 | `qa` | `qa` |

Un push a `main` o `qa` despliega. También se puede lanzar a mano (Actions > Deploy (PM2) > Run workflow), pero el
ambiente elegido debe coincidir con la rama del run (`production` solo desde `main`, `qa` solo desde `qa`).
Cualquier otra rama no despliega.

## Qué hace

1. Resuelve el ambiente por rama y valida que coincida.
2. En el runner del servidor: checkout, Node 20.
3. Copia el archivo de configuración del servidor (`APP_ENV_FILE`) a `.env` y aplica encima las variables no secretas
   definidas en el Environment de GitHub.
4. Valida el `.env` y frena si algo no cuadra (ver "Validaciones").
5. `npm ci`, comprueba el esquema de PG reportes, `prisma generate` y compila.
6. `pm2 startOrRestart ecosystem.config.js --env <production|qa> --update-env` y `pm2 save`.
7. Verifica que PM2 esté `online` y que el puerto responda; si no, falla y muestra el log.

## Preparación única

### Runners
Registrar un runner self-hosted en cada servidor con las etiquetas `self-hosted`, `Linux`, `X64` y, además,
`produccion` (172.30.149.75) o `qa` (192.168.8.121). El usuario del runner necesita `pm2`, `node`/`npm` y `curl`.

### GitHub Environments
Crear `production` y `qa` (Settings > Environments). En `production` conviene activar **Required reviewers**
para que cada despliegue exija aprobación, y limitar las ramas a `main` (en `qa`, a `qa`).

### Archivo de configuración del servidor
Crear en cada servidor un archivo con las variables de `.env.example`, fuera del workspace del runner:

- `/opt/sysip/env/nest-api.production.env`
- `/opt/sysip/env/nest-api.qa.env`

(Otra ruta: definir la variable `APP_ENV_FILE` del Environment.) Permisos recomendados: `chmod 600`, propietario el
usuario del runner. **Los secretos viven solo aquí**, nunca en GitHub ni en el repositorio.

## Variables

### Obligatorias en el archivo del servidor
`SERVER_BD`, `NAME_BD`, `USER_BD`, `PASSWORD_BD` (Sis2000). Si `REPORTES_ENABLED=true`: `REPORTES_PG_HOST`,
`REPORTES_PG_USER`, `REPORTES_PG_PASSWORD`, `REPORTES_PG_DATABASE`.
El resto está en `.env.example` (autenticación `NEST_*`, correo, SARYS, partners, etc.).

### Valores esperados por ambiente (el deploy los exige)
| Variable | production | qa |
|---|---|---|
| `NAME_BD` | `Sis2000` | `sis2000_qa` |
| `REPORTES_PG_HOST` | `172.30.149.75` | `192.168.8.121` |

Esto evita desplegar producción apuntando a QA, o al revés.

### Opcionales en el Environment de GitHub (Variables, no secretos)
Si existen, pisan la línea del archivo del servidor. Si no existen, se respeta el archivo.

| Variable | Recomendado | Efecto |
|---|---|---|
| `REPORTES_ENABLED` | `true` | Activa los reportes dinámicos |
| `REPORTES_SYNC_ENABLED` | `true` | Habilita la sincronización con Sis2000 |
| `REPORTES_SYNC_SCHEDULE_ENABLED` | `true` | Refresco programado en segundo plano |
| `REPORTES_SYNC_SCHEDULE_INTERVAL_MINUTES` | `5` | Cada cuántos minutos corre |
| `REPORTES_SYNC_SCHEDULE_WINDOW_DAYS` | `7` | Ventana de días de las pasadas de cobrados y anulados |
| `REPORTES_SYNC_SCHEDULE_ENTIDADES` | `recibos,siniestros` | Entidades que refresca el programado |
| `REPORTES_SYNC_RECIBOS_ON_EXECUTE` | `false` | La consulta de recibos no sincroniza (responde de PG) |
| `REPORTES_SYNC_SINIESTROS_ON_EXECUTE` | `false` | Ídem para siniestros |
| `REPORTES_SYNC_TTL_SECONDS`, `REPORTES_SYNC_CATALOG_TTL_SECONDS`, `REPORTES_SYNC_TIMEOUT_MS`, `REPORTES_SYNC_BATCH_SIZE` | según necesidad | Ajustes finos del sync |
| `PORT`, `CORS_ORIGIN` | según ambiente | Puerto y orígenes permitidos |
| `APP_ENV_FILE` | (ruta) | Ubicación del archivo de configuración del servidor |

## Validaciones (bloquean el despliegue)
- Falta alguna variable obligatoria.
- `NAME_BD` o `REPORTES_PG_HOST` no corresponden al ambiente.
- Faltan columnas en PG reportes (`recibo.tipo_canal`, `placa`, `tipo_vehiculo`; `siniestro.id_canal`, `tipo_canal`,
  `cobertura_afectada`, `tipo_vehiculo`). En ese caso ejecutar antes los DDL de `docs/sql/postgres/reportes/`.

Avisos que no bloquean: refresco programado apagado, o consultas que siguen sincronizando
(`REPORTES_SYNC_RECIBOS_ON_EXECUTE` / `REPORTES_SYNC_SINIESTROS_ON_EXECUTE` distintos de `false`).

## Orden de un pase a producción de reportes
1. Aplicar en PG de producción los DDL y los SP de `docs/sql/postgres/reportes/` y el `origen_config`
   (`scripts/reportes/patch-origen-config.js`).
2. Merge a `main` (despliega).
3. Recarga con `forceSync` si cambió el `querySql` o el esquema.

## Notas
- El workflow anterior desplegaba en cualquier push a `main` o `master` a un único runner. Ahora `master` ya no
  despliega y cada ambiente usa su propio runner.
- No hay reversa automática: si falla la validación, la instalación o la compilación, PM2 no se toca y sigue corriendo la versión anterior. Si el fallo ocurre al reiniciar, revisar `pm2 logs sysip-nest-api`. Para volver a una versión anterior, revertir el commit en la rama (`git revert`) y hacer push: el despliegue siempre sale de la punta de la rama.
