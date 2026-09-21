-- Azure Data Studio: NO pegar GO (el motor lo rechaza).
-- Combo de la conexion = la misma BD donde esta la tabla
-- (Sis2000_DES en la prueba; nest-api solo ve NAME_BD).
-- Ejecutar cada bloque en una consulta nueva.

-- ========== BLOQUE 1: encender trigger de adpoliza ==========
USE [Sis2000_DES];

IF OBJECT_ID(N'dbo.tr_adpoliza_sync_rms_nexus', N'TR') IS NULL
    THROW 50001, N'Falta tr_adpoliza_sync_rms_nexus. Publica primero el CREATE TRIGGER.', 1;

ENABLE TRIGGER dbo.tr_adpoliza_sync_rms_nexus ON dbo.adpoliza;

SELECT
    t.name,
    t.is_disabled,
    OBJECT_NAME(t.parent_id) AS tabla
FROM sys.triggers t
WHERE t.name IN (
    N'tr_adpoliza_sync_rms_nexus',
    N'tr_maclient_sync_rms_nexus'
);
-- is_disabled = 0 y tabla = adpoliza  -> ya esta activo.

-- ========== BLOQUE 2: trigger maclient (consulta NUEVA, primer statement) ==========
-- Cierra el bloque 1. Nueva pestana, combo Sis2000_DES, pega SOLO el CREATE
-- de tr_maclient_sync_rms_nexus que esta en tr_sync_poliza_evento_rms_nexus.sql
-- (desde CREATE TRIGGER hasta el END;). Sin USE, sin GO.

-- ========== BLOQUE 3: disparar (columna que el trigger SI mira) ==========
-- fultmod NO dispara. iestado / ctenedor / casegurado / cbeneficiario / fdesde / fhasta / cnpoliza SI.
USE [Sis2000_DES];

UPDATE dbo.adpoliza
   SET iestado = iestado,
       cusuariomod = 1
 WHERE cnpoliza = N'7-1-1000002371'
   AND fanopol = 2026
   AND fmespol = 5;

SELECT TOP 20
    id, cnpoliza, origen, estado, fcreated
FROM dbo.sync_poliza_evento_rms_nexus
ORDER BY id DESC;
