/* =====================================================================================
   Póliza de flota con recibo por viaje (Ridery) — CONSULTAS DE DIAGNÓSTICO (solo SELECT)
   Correr en Sis2000_QA (NUNCA en "Sis2000.", que es producción). Pegar la salida en el chat.
   ===================================================================================== */
USE Sis2000_QA;
GO

-- 1. Póliza de prueba: cabecera (¿es colectiva 'C'? ¿plan, frecuencia, moneda, estado?)
SELECT cpoliza, cnpoliza, cramo, cplan, itipopol, ifrecuencia, cmoneda, istatpol,
       fdesde, fhasta, fanopol, fmespol, casegurado, ctenedor, cproductor,
       cpoliza_mae, ccerti_mae, cproces, csucur
FROM adpoliza
WHERE cnpoliza = '18-1-1130480881'
ORDER BY fanopol DESC, fmespol DESC;

-- 2. Certificados (vehículo + conductor) de la póliza de prueba
SELECT v.ccerti, v.istatcer, v.cplan, v.xplaca, v.xconductor, v.casegurado, a.cid, a.xcliente,
       v.fdesde, v.fhasta, v.mtotpri
FROM vhcerti v
LEFT JOIN maclient a ON a.cci_rif = v.casegurado
WHERE v.cnpoliza = '18-1-1130480881'
ORDER BY v.ccerti;

-- 3. Recibos de la póliza de prueba por certificado y estado
SELECT ccerti, itiporec, iestadorec, COUNT(*) AS recibos, SUM(mprimabrutaext) AS prima_ext, MIN(fdesde) AS desde, MAX(fhasta) AS hasta
FROM adrecibos
WHERE cnpoliza = '18-1-1130480881'
GROUP BY ccerti, itiporec, iestadorec
ORDER BY ccerti, itiporec, iestadorec;

-- 4. Flotas de auto colectivas vigentes: certificados y recibos por certificado (para ver el modelo real)
SELECT TOP 20 p.cnpoliza, p.cplan, p.ifrecuencia, p.cmoneda,
       COUNT(DISTINCT v.ccerti) AS certificados,
       COUNT(r.crecibo)         AS recibos,
       SUM(CASE WHEN r.ccerti = 0 THEN 1 ELSE 0 END) AS recibos_cert_0
FROM adpoliza p
JOIN vhcerti v   ON v.cpoliza = p.cpoliza AND v.fanopol = p.fanopol AND v.fmespol = p.fmespol
LEFT JOIN adrecibos r ON r.cpoliza = v.cpoliza AND r.fanopol = v.fanopol AND r.fmespol = v.fmespol AND r.ccerti = v.ccerti
WHERE p.itipopol = 'C' AND p.cramo = 18 AND p.istatpol = 'V'
GROUP BY p.cnpoliza, p.cplan, p.ifrecuencia, p.cmoneda
ORDER BY certificados DESC;

-- 5. Planes RIDERY / RIDER* usados en pólizas
SELECT cplan, itipopol, COUNT(*) AS polizas
FROM adpoliza
WHERE cplan LIKE 'RID%' OR cplan = 'LARA'
GROUP BY cplan, itipopol;

-- 6. SP relacionados: cuáles existen en QA (y fecha de modificación)
SELECT name, create_date, modify_date
FROM sys.procedures
WHERE name IN (
  'SPCargaRecibosColectivos', 'adBRecibo_Frecuencia_Colectivo', 'spCorrigeCertificadoFlota', 'SP_CalculoAltas',
  'CreaColectivo_AD', 'sp_crear_recibo_endoso_nexus', 'sp_calcula_num_contador_nexus', 'sp_genera_adpolrea_nexus',
  -- propuestos (deberían NO existir todavía):
  'sp_flota_crear_poliza_nexus', 'sp_flota_incluir_certificado_nexus', 'sp_flota_excluir_certificado_nexus',
  'sp_crear_recibo_certificado_nexus')
ORDER BY name;

-- 7. Trigger que crea la póliza matriz de flota (el volcado del repo está truncado)
SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.TEmision_Flota_Auto')) AS def_TEmision_Flota_Auto;
SELECT name, OBJECT_NAME(parent_id) AS tabla, is_disabled FROM sys.triggers
WHERE OBJECT_NAME(parent_id) IN ('TMEMISION_FLOTA_AUTO', 'TMEMISION_FLOTA', 'adrecibos', 'adpoliza', 'vhcerti');

-- 8. Columnas obligatorias de adrecibos sin default (para validar la propuesta del SP de recibo)
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'adrecibos' AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT IS NULL
ORDER BY ORDINAL_POSITION;

-- 9. ¿Existe adcertificado? (sp_crear_recibo_endoso_nexus la actualiza si existe)
SELECT OBJECT_ID('dbo.adcertificado') AS adcertificado_id;

-- 10. Coberturas y tarifas por recibo en una flota real (¿el recibo de flota lleva adpolcob/adpoltar?)
SELECT TOP 30 c.* FROM adpolcob c
WHERE c.cpoliza = (SELECT TOP 1 cpoliza FROM adpoliza WHERE cnpoliza = '18-1-1130480881' ORDER BY fanopol DESC, fmespol DESC);

-- 11. Comisión vigente del ramo 18 (la usa SPCargaRecibosColectivos)
SELECT * FROM maarancel WHERE cramo = 18 AND iestado = 'V';

-- 12. Tasa de cambio del día (recibos en $ guardan también Bs)
SELECT TOP 3 cmoneda, fmoneda, ptasamon FROM mavamoneda WHERE TRIM(cmoneda) = '$' ORDER BY fmoneda DESC;
