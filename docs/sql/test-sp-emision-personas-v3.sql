-- Prueba de sp_emision_personas_general_nexus v3 (QA). Todo corre dentro de una transaccion que se revierte.
-- Usa cedulas ficticias 7000001/7000002. Cuadre esperado: pepoltar = pepolcob = adpoltar = adpolcob = recibo.
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRAN;
DECLARE @aseg NVARCHAR(MAX) = N'[
 {"tipo_cedula_asegurado":"V","rif_asegurado":7000001,"nombre_asegurado":"Antonia","apellido_asegurado":"Perez","sexo_asegurado":"F","estado_civil_asegurado":"S","fnac_asegurado":"1998-06-23","estado_asegurado":1,"ciudad_asegurado":28,"nparentesco_asegurado":1,"precargo":10,"pdescuento":0},
 {"tipo_cedula_asegurado":"V","rif_asegurado":7000002,"nombre_asegurado":"Paola","apellido_asegurado":"Guinand","sexo_asegurado":"F","estado_civil_asegurado":"S","fnac_asegurado":"2015-10-05","estado_asegurado":1,"ciudad_asegurado":28,"nparentesco_asegurado":3,"precargo":0,"pdescuento":5}
]';
EXEC sp_pre_emision_personas_general_nexus
  @cnpoliza_rel=NULL, @cplan='ANDIE2', @cramo=7,
  @icedula_tomador='V', @xrif_tomador=7000001, @xnombre_tomador='Antonia', @xapellido_tomador='Perez', @isexo_tomador='F', @iestado_civil_tomador='S', @fnac_tomador='1998-06-23', @cestado_tomador='1', @cciudad_tomador='28', @xdireccion_tomador='x', @xtelefono_tomador='04140000000', @xcorreo_tomador='a@a.com',
  @icedula_titular='V', @xrif_titular=7000001, @xnombre_titular='Antonia', @xapellido_titular='Perez', @isexo_titular='F', @iestado_civil_titular='S', @fnac_titular='1998-06-23', @cestado_titular='1', @cciudad_titular='28', @xdireccion_titular='x', @xtelefono_titular='04140000000', @xcorreo_titular='a@a.com',
  @cpersona_politica='0', @cterm_y_cod='1', @cdiagnos_enferm='0', @cproductor=215, @ptasamon=NULL, @ifrecuencia='A',
  @femision='2026-10-05', @fdesde='2026-10-05', @fhasta='2027-10-05', @api='TEST', @method='TEST', @cprog='TEST', @ifuente='API', @fingreso='2026-10-05',
  @asegurados=@aseg, @beneficiarios=NULL, @cusuario=7;
DECLARE @id INT = (SELECT MAX(id) FROM TMEMISION_PERSONAS_GENERAL);
DECLARE @cp NUMERIC(19) = (SELECT cpoliza FROM TMEMISION_PERSONAS_GENERAL WHERE id=@id);
PRINT '== ASEG'; SELECT nasegurado, xrif_asegurado, nparentesco_asegurado, precargo, pdescuento FROM TMEMISION_PERSONAS_GENERAL_ASEG WHERE id=@id;
PRINT '== pepoltar_ind'; SELECT iclaseaseg, casegurado, ccober, ctarifa, mprimaext, mprima, precargo, pdescuento, mrecargo, mdescuento, mprimabruta, mcomision FROM pepoltar_ind WHERE cpoliza=@cp ORDER BY ccober, casegurado;
PRINT '== pepolcob_ind'; SELECT iclaseaseg, casegurado, ccober, mprimabruta, pcomision, mcomision, msumaaseg FROM pepolcob_ind WHERE cpoliza=@cp ORDER BY ccober, casegurado;
PRINT '== adpoltar'; SELECT ccober, ctarifa, mprimaext, mprima, mrecargo, mdescuento, precargo, pdescuento, mprimabruta, mcomision FROM adpoltar WHERE cpoliza=@cp ORDER BY ccober;
PRINT '== adpolcob'; SELECT ccober, mprimabruta, pcomision, mcomision, msumaaseg FROM adpolcob WHERE cpoliza=@cp ORDER BY ccober;
PRINT '== adrecibos'; SELECT cnpoliza, mprimabruta, mprimaneta, pcomision, mcomision FROM adrecibos WHERE cpoliza=@cp;
PRINT '== cuadre: SUM(pepoltar)=SUM(pepolcob)=SUM(adpoltar)=SUM(adpolcob)=recibo';
SELECT (SELECT SUM(mprimabruta) FROM pepoltar_ind WHERE cpoliza=@cp) pepoltar, (SELECT SUM(mprimabruta) FROM pepolcob_ind WHERE cpoliza=@cp) pepolcob, (SELECT SUM(mprimabruta) FROM adpoltar WHERE cpoliza=@cp) adpoltar, (SELECT SUM(mprimabruta) FROM adpolcob WHERE cpoliza=@cp) adpolcob, (SELECT SUM(mprimabruta) FROM adrecibos WHERE cpoliza=@cp) recibo;
ROLLBACK TRAN;
PRINT 'ROLLBACK ok';
