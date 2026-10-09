-- =====================================================================================
-- Verificación en Sis2000 PRODUCCIÓN de los objetos que usan los endpoints del Motor de Endosos.
--   * Solo LEE (no modifica nada). Ejecutar en la base de Sis2000 de producción.
--   * La huella (hash) viene de Sis2000_QA (2026-10-09) y se calcula sin espacios ni
--     saltos de línea, para que no distingan formato. DIFERENTE = el código del objeto no es el de QA.
--   * Endpoints cubiertos: planesCatalog, planFrequencies, calculatePlan / planesSolicitud, createReceipt,
--     reportPayment, PDF del cuadro de póliza y las consultas de póliza/recibos de /api/endosos/core/*.
--   * OJO sp_rpt_cuadro_poliza: la versión a desplegar es la del repo (docs/sql/sp_rpt_cuadro_poliza.sql,
--     orden por fdesde). QA aún no la tiene, así que ese objeto saldrá DIFERENTE a propósito.
-- =====================================================================================
SET NOCOUNT ON;

-- 1) Objetos programables (SP / funciones / vistas)
DECLARE @esperado TABLE (nombre SYSNAME, tipo VARCHAR(2), hash_qa VARCHAR(64));
INSERT INTO @esperado (nombre, tipo, hash_qa) VALUES
  (N'CalcularNotificacion', 'FN', 'B2EB480CD86986A90CC6FC425FF09E211AC6DC52E641152CAD709BDA7CC30107'), -- dependencia de otro SP del flujo
  (N'fn_buscar_tasa_casco', 'FN', '5A78A6505B88873ED5438AEC987819DC616E3E1368926C9DA25F5C47D8BB125B'), -- dependencia de otro SP del flujo
  (N'fn_validateCoberAccess', 'FN', '52B42DF271B6670B2DD57D7EE061D9183EDA282D449453CD8C3D11AE846D0F9B'), -- dependencia de otro SP del flujo
  (N'adBCalculo_Bonos', 'P', 'A34801425C45E00FEED83D69F6D34B021C5BA719AF7892C69B7B8FBB32250FDE'), -- dependencia de otro SP del flujo
  (N'adBCalculo_GastoRamov2', 'P', 'C53E8FFE241F2AACA073E64E03AEA4D0E1778ECB2C24D6A84793EAE5B8865CAB'), -- dependencia de otro SP del flujo
  (N'adCobroSis_Pas', 'P', 'F1BFA3B74EA7FF5A546647E6EFE6C400ED28CE11CEFF1AAD9F25F639FE0E407B'), -- dependencia de otro SP del flujo
  (N'sp_busca_frecuencia_plan_nexus', 'P', '146629F4F62F9EC140FF143D65DBB59129161170D666388F127BEABF4E375A5A'), -- planFrequencies (valrep/frecuencia)
  (N'sp_calcula_num_contador_nexus', 'P', '793F0297EE3DB1FDE2000B386342724E0B888A4B71B795D20C244CA170B2CA9D'), -- dependencia de otro SP del flujo
  (N'sp_calculo_auto_nexus', 'P', 'BA335841106E86F9BCB93DF4BE7D96FBE9ACAE228847E763648BCFE403B1ED83'), -- calculatePlan / planesSolicitud (endosos/core/calcular-plan-sis, planes-solicitud)
  (N'sp_crear_recibo_endoso_nexus', 'P', 'E8FDA40195419618A94852E8F46F0908DDDF4C3C5E281ACFE6D4A7F380FDA8A1'), -- createReceipt (endoso-recibos/crearRecibo)
  (N'sp_genera_adpolrea_nexus', 'P', 'B420534B7DD17C6A72A201ADE33D0C1988F731EBD6FEE8810925D9DD753AF693'), -- dependencia de otro SP del flujo
  (N'sp_rpt_cuadro_poliza', 'P', '5AF6F0E66F7262411FAEEDCB5195CBE43FBA654CEC8C6932066130E05C3F2E4D'), -- PDF cuadro de póliza (orden de recibos)
  (N'spBuscaPlan', 'P', '15570D50BFF0749F936CB3A1CA9EDE84BC75CB68FA9FAC056FFE05837346EF75'), -- planesCatalog (valrep/planes/v2)
  (N'spCnSaldo_Ad', 'P', '30CC881D23A61A4E6CEAA5BF3A6E2639126E9009FEB9772C0AFF58668F42A74C'), -- reportPayment (external/collection/collect)
  (N'spCobroSis_Ad', 'P', '89595BC12CF84E1C7392AFBF303747DBC34D6D42748759E8426104DF322DBCBC'), -- reportPayment (external/collection/collect)
  (N'SpMovim', 'P', '045FFE313F531DC992D5AB6FE690DC71371749AE3A4BC93543D90548DC52AC8C'), -- dependencia de otro SP del flujo
  (N'spNotificaPago', 'P', '27A86038F86FBC4CA08FB0789461FA7BCA92FE2D7D9A0E58C9DB5EA6AE4C3E54'), -- reportPayment (external/collection/collect)
  (N'spUpsertCbreportePago_Ad', 'P', 'C87F752F76D6B62C037C7873D297F680DC5782D39BF8564441EB0E9554F27E57'), -- reportPayment (external/collection/collect)
  (N'maVplanes', 'V', 'EDB0FB56209363E95C58AA4F16F9DCF4CF8B823FB58B9E0B6110B49CA46C09FF'), -- dependencia de otro SP del flujo
  (N'VInma', 'V', 'A4A297CE93059F48FB1337980CA312B2C3D22AB8B5E0CAAC5C4EDBA1A5A612AB'); -- dependencia de otro SP del flujo

SELECT
  e.nombre,
  e.tipo,
  CASE
    WHEN o.object_id IS NULL THEN 'FALTA'
    WHEN CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', REPLACE(REPLACE(OBJECT_DEFINITION(o.object_id), CHAR(13), ''), ' ', '')), 2) = e.hash_qa THEN 'OK'
    ELSE 'DIFERENTE'
  END AS estado,
  o.modify_date AS modificado_en_prod
FROM @esperado e
LEFT JOIN sys.objects o ON o.name = e.nombre AND o.schema_id = SCHEMA_ID('dbo')
ORDER BY CASE WHEN o.object_id IS NULL THEN 0 ELSE 1 END, e.tipo, e.nombre;

-- 2) Tablas / vistas usadas (solo existencia)
DECLARE @tablas TABLE (nombre SYSNAME);
INSERT INTO @tablas (nombre) VALUES
  (N'adctacli'),
  (N'adctacli_det'),
  (N'admovcom'),
  (N'admovrec'),
  (N'adpolcob'),
  (N'adpoliza'),
  (N'adpolrea'),
  (N'adpoltar'),
  (N'adprod_mult'),
  (N'adrecibos'),
  (N'adsolpg'),
  (N'adsolpg_d'),
  (N'auoperaciones'),
  (N'cbreporte_pago'),
  (N'cbreporte_pago_d'),
  (N'cbreporte_tran'),
  (N'facerti'),
  (N'insinstalac'),
  (N'insramfor'),
  (N'insramo'),
  (N'insramoint'),
  (N'instarint'),
  (N'maanomod'),
  (N'maarancel'),
  (N'mabonos'),
  (N'macalcasco'),
  (N'macanalalt'),
  (N'macategtr'),
  (N'macattip'),
  (N'macatvalores'),
  (N'maciudades'),
  (N'maclient'),
  (N'maclient_banco'),
  (N'maclient_correo'),
  (N'maclient_dir'),
  (N'maclient_tel'),
  (N'macoberturas'),
  (N'macobtipo'),
  (N'macontadores'),
  (N'macontadores_web'),
  (N'maestados'),
  (N'magastosramo'),
  (N'magestor'),
  (N'mainma'),
  (N'mamarcas'),
  (N'mamodelo'),
  (N'mamonedas'),
  (N'maparent'),
  (N'maplancob'),
  (N'maplanes'),
  (N'maplanes_frec'),
  (N'maplanes_frec_produc'),
  (N'maplanes_per'),
  (N'maplantar'),
  (N'maplantar_dias'),
  (N'maproduc'),
  (N'maramos'),
  (N'marangoano'),
  (N'marangosum'),
  (N'masucur'),
  (N'matarifa'),
  (N'matarifa_d'),
  (N'matipopago'),
  (N'matipoprod'),
  (N'matiporamo'),
  (N'matipos'),
  (N'mausuplan'),
  (N'mavamoneda'),
  (N'maversion'),
  (N'peasegurados'),
  (N'pebenefi'),
  (N'rgcerti'),
  (N'seusuariosweb'),
  (N'SUCONTRATOFLOTA'),
  (N'SURECIBO'),
  (N'surecibo_h'),
  (N'tmemision_automovil_rcv2'),
  (N'vhcerti'),
  (N'VWBUSCARCOBERTURASXCONTRATOFLOTA');

SELECT t.nombre AS tabla_o_vista_que_FALTA
FROM @tablas t
LEFT JOIN sys.objects o ON o.name = t.nombre AND o.schema_id = SCHEMA_ID('dbo') AND o.type IN ('U', 'V')
WHERE o.object_id IS NULL;
