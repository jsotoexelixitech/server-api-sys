-- Parche mínimo: prima 0 en planes premium (AutoV, maplantar)
--
-- Síntoma: PDF con coberturas vacías y prima 0; cotización API OK (~235 USD).
-- Causa: spGeneraCoberturasYRecibos_Auto_RCV2 llama spCalculoAuto con @sumaAseg = 0.
--        Planes ≠ RCVBAS obtienen primas por fila desde #montos JOIN maplantar.
--
-- Cadena: sp_pre_emision_automovil_rcv_nexus → sp_emision_automovil_rcv_nexus
--         → spGeneraCoberturasYRecibos_Auto_RCV2 → spCalculoAuto
--
-- Aplicar en Sis2000 QA (SSMS / sqlcmd). Requiere ALTER PROCEDURE.
--
-- PASO 1: Abrir spGeneraCoberturasYRecibos_Auto_RCV2 en BD Sis2000.
-- PASO 2: Localizar EXEC spCalculoAuto (aprox. línea 162-187).
-- PASO 3: Reemplazar SOLO esta línea:

--   ANTES:
--     @sumaAseg = 0,

--   DESPUÉS:
--     @sumaAseg = ISNULL(@msumaasegext, 0),

-- Nota: @msumaasegext se calcula unas líneas arriba (bloque IF @msumaaseg IS NOT NULL)
--       cuando cmoneda ≠ Bs — coincide con msumaaseg enviado desde nest-api (referenceSuma).

-- Verificación post-parche:
--   SELECT COUNT(*) FROM adpolcob c
--   JOIN adrecibos r ON r.crecibo = c.crecibo
--   WHERE RTRIM(r.cnpoliza) = '18-1-XXXXXXXXXX' AND c.mprimabruta > 0;

-- Reparar pólizas ya emitidas con prima 0 (opcional):
--   EXEC sp_repair_rcv_coberturas_nexus @cnpoliza = '18-1-0000080593';
