---
name: "🔄 Migración de endpoint"
about: Solicitud para migrar un endpoint del Express original al nuevo servidor NestJS
title: "[MIGRATION] POST /ruta-del-express"
labels: migration, enhancement
assignees: ''
---

## Endpoint a migrar

**Método y ruta en Express original:**
```
POST /ruta-original
```

**Archivo fuente en `src/`:**
```
src/db/NombreDelArchivo.js  (función: nombreFuncion)
```

## Descripción del endpoint

<!-- Qué hace, para qué se usa -->

## Stored Procedures / tablas involucradas

- SP: `spNombreDelSP`
- Tablas: `tabla1`, `tabla2`

## Parámetros de entrada (según documentación)

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `campo1` | string | ✅ | ... |
| `campo2` | number | ✅ | ... |

## Respuesta esperada

```json
{
  "status": true,
  "data": { ... }
}
```

## Bugs conocidos en el Express original

<!-- SQL injection, catch vacíos, tipos incorrectos, etc. -->

## Notas de seguridad

<!-- Requiere apikey, validaciones especiales, etc. -->
