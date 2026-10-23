/* =============================================================================
   RCV Nexus — país de la dirección del tomador y del titular (placa extranjera)
   -----------------------------------------------------------------------------
   Problema: sp_emision_automovil_rcv_nexus crea el cliente (sp_create_maclient_nexus)
   con cpais = 58 fijo, así que una dirección de Colombia (cpais 57, códigos DANE) se
   graba como Venezuela. TMEMISION_AUTOMOVIL_RCV2 no tiene columna de país.

   Cambio compatible hacia atrás: sin país enviado (NULL) todo sigue en 58 como hoy.
   Conductor y beneficiario no cambian (siguen en 58).

   Aplicar en Sis2000 QA primero. Lo aplica La Mundial (DBA/Luis); nest-api solo envía
   @cpais_tomador / @cpais_titular cuando esté activado (NEST_RCV_SEND_CPAIS=1).

   sp_create_maclient_nexus (QA, revisado 23-oct-2026) NO requiere cambios: graba @cpais,
   @cestado y @cciudad tal cual en maclient_dir (insert y update) sin validar contra Venezuela.

   ANTES DE APLICAR verificar que los códigos de Colombia caben en SMALLINT (parámetros
   @cestado/@cciudad de sp_create_maclient_nexus):
     SELECT MAX(cestado), MAX(cciudad), COUNT(*) FROM maciudades WHERE cpais = 57;
   Si MAX(cciudad) > 32767 hay que ampliar esos parámetros (y revisar maclient_dir).

   Observación aparte (no es de este cambio): en sp_create_maclient_nexus, paso 3
   MACLIENT_DIR, el IF @xdireccion IS NOT NULL ... solo aplica al DECLARE; el bloque
   BEGIN ... END del upsert corre aunque la dirección venga vacía.
   ============================================================================= */

USE Sis2000;
GO

/* ---------------------------------------------------------------------------
   PASO 1 — Tabla: dos columnas opcionales
   --------------------------------------------------------------------------- */
IF COL_LENGTH('dbo.TMEMISION_AUTOMOVIL_RCV2', 'cpais_tomador') IS NULL
    ALTER TABLE dbo.TMEMISION_AUTOMOVIL_RCV2 ADD cpais_tomador SMALLINT NULL;
IF COL_LENGTH('dbo.TMEMISION_AUTOMOVIL_RCV2', 'cpais_titular') IS NULL
    ALTER TABLE dbo.TMEMISION_AUTOMOVIL_RCV2 ADD cpais_titular SMALLINT NULL;
GO

/* ---------------------------------------------------------------------------
   PASO 2 — sp_pre_emision_automovil_rcv_nexus (3 ediciones, no se toca el INSERT)
   --------------------------------------------------------------------------- */

-- 2a) Al final de la lista de parámetros, después de:
--         @cgestor             VARCHAR(60) = NULL
--     agregar (con coma en la línea anterior):
--         ,@cpais_tomador      SMALLINT      = NULL,
--         @cpais_titular       SMALLINT      = NULL

-- 2b) En el bloque "2. Asignación y herencia en cascada de actores":
--     - dentro del IF que copia titular → tomador, agregar:
--           SET @cpais_tomador = ISNULL(@cpais_tomador, @cpais_titular);
--     - dentro del IF que copia tomador → titular, agregar:
--           SET @cpais_titular = ISNULL(@cpais_titular, @cpais_tomador);

-- 2c) Inmediatamente después de:
--         SET @id = SCOPE_IDENTITY();
--     y ANTES de  EXEC sp_emision_automovil_rcv_nexus, agregar:
--
--     IF @cpais_tomador IS NOT NULL OR @cpais_titular IS NOT NULL
--         UPDATE TMEMISION_AUTOMOVIL_RCV2
--            SET cpais_tomador = @cpais_tomador,
--                cpais_titular = @cpais_titular
--          WHERE id = @id;

/* ---------------------------------------------------------------------------
   PASO 3 — sp_emision_automovil_rcv_nexus (4 ediciones)
   --------------------------------------------------------------------------- */

-- 3a) En el DECLARE de variables locales, agregar al final (antes del ';'):
--         , @cpais_tomador SMALLINT, @cpais_titular SMALLINT

-- 3b) En el SELECT ... FROM TMEMISION_AUTOMOVIL_RCV2 WHERE ID = @ID, agregar:
--         , @cpais_tomador = cpais_tomador, @cpais_titular = cpais_titular

-- 3c) Antes de "-- CREACIÓN DEL CLIENTE TITULAR", agregar:
--         SET @cpais_tomador = ISNULL(@cpais_tomador, 58);
--         SET @cpais_titular = ISNULL(@cpais_titular, 58);

-- 3d) En los EXEC sp_create_maclient_nexus del TITULAR y del TOMADOR, cambiar el
--     décimo argumento 58 por la variable (en EXEC no se puede usar ISNULL directo):
--
--     TITULAR:  @isexo_titular, @iestado_civil_titular, @fnac_titular, @xcorreo_titular, @cpais_titular,
--     TOMADOR:  @isexo_tomador, @iestado_civil_tomador, @fnac_tomador, @xcorreo_tomador, @cpais_tomador,
--
--     (CONDUCTOR y BENEFICIARIO se quedan con 58.)

/* ---------------------------------------------------------------------------
   VERIFICACIÓN (después de aplicar y de una emisión de prueba)
   --------------------------------------------------------------------------- */
-- SELECT name FROM sys.columns
--  WHERE object_id = OBJECT_ID('dbo.TMEMISION_AUTOMOVIL_RCV2') AND name LIKE 'cpais%';
--
-- SELECT p.name FROM sys.parameters p
--  WHERE p.object_id = OBJECT_ID('dbo.sp_pre_emision_automovil_rcv_nexus') AND p.name LIKE '@cpais%';
--
-- -- Póliza de prueba con dirección en Colombia:
-- SELECT t.cnpoliza, t.cpais_tomador, t.cestado_tomador, t.cciudad_tomador, d.cpais, d.cestado, d.cciudad
--   FROM TMEMISION_AUTOMOVIL_RCV2 t
--   JOIN maclient_dir d ON d.cci_rif = t.xrif_tomador
--  WHERE RTRIM(t.cnpoliza) = '18-1-XXXXXXXXXX';
