# sp_get_sustancias_nexus

SP oficial en Sis2000 (creado por BD La Mundial). **No desplegar desde este repo.**

## Uso nest-api

- Endpoint: `GET /api/v1/valrep/recargosRCV`
- Código: `ValrepService.getRecargosRcv(cramo)` → `EXEC sp_get_sustancias_nexus @cramo`

## Contrato

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `@cramo` | `INT` | — | Ramo Sis2000 (`18` = RCV auto) |

## Result set esperado (masustac)

| Columna | Descripción |
|---------|-------------|
| `csustanc` | Código sustancia / actividad |
| `xsustanc` | Descripción |
| `porcenta` | Porcentaje recargo RCV |

Paridad legacy: `GET /valrep/recargosRCV` (SysIP → `masustac` ramo 18).
