# migracion-sql-directo #10 — recargosRCV

**SP en BD:** `sp_get_sustancias_nexus` (creado en Sis2000, no versionado aquí).

**nest-api:** `valrep.service.ts` → `getRecargosRcv()` ejecuta el SP con `@cramo INT` (18 para RCV).

Reemplaza SQL directo:
```sql
SELECT csustanc, xsustanc, porcenta FROM masustac WHERE cramo = @cramo
```
