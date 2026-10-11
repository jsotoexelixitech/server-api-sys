CREATE   PROCEDURE [dbo].[sp_genera_coberturas_siniestro_personas_nexus]
    @cpoliza NUMERIC(19, 0),
    @fanopol INT,
    @fmespol INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Genera coberturas a nivel individual de asegurado en pepolcob_ind
    INSERT INTO pepolcob_ind (
        crecibo, iclaseaseg, casegurado, nmenor, ccerti, ccober, u_version, cramo, cproces, cpoliza,
        fanopol, fmespol, cnpoliza, cnrecibo, csucur, cmoneda, ptasamon, fdesde, fhasta, itipoprod,
        msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision, mcomision, mcomisionext,
        mprimareas, mprimareasext, iestado, isuma, ccontrea, cramorea, cramopcnd, ccoberpcnd, cramoint,
        ccoberturaint, btarifaok, cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria,
        cusuarioauto, ccategoriaauto, fultmod, cusuariomod, ccategoriamod
    )
    SELECT
        A.crecibo, B.iclaseaseg, B.casegurado, B.nmenor, A.ccerti, A.ccober, A.u_version, A.cramo, A.cproces, A.cpoliza,
        A.fanopol, A.fmespol, A.cnpoliza, A.cnrecibo, A.csucur, A.cmoneda, A.ptasamon, A.fdesde, A.fhasta, A.itipoprod,
        A.msumaaseg, A.msumaasegext, A.mprimabruta, A.mprimabrutaext, A.pcomision, A.mcomision, A.mcomisionext,
        A.mprimareas, A.mprimareasext, A.iestado, A.isuma, A.ccontrea, A.cramorea, A.cramopcnd, A.ccoberpcnd, A.cramoint,
        A.ccoberturaint, NULL, A.cprog, A.ifuente, A.bok, A.cerror, GETDATE(), 7, 1, NULL, NULL, NULL,
        NULL, NULL
    FROM adpolcob A WITH (NOLOCK)
    INNER JOIN peasegurados B WITH (NOLOCK) ON A.cpoliza = B.cpoliza AND A.fanopol = B.fanopol AND A.fmespol = B.fmespol
    WHERE A.cpoliza = @cpoliza AND A.fanopol = @fanopol AND A.fmespol = @fmespol;

    -- Genera coberturas a nivel individual de asegurado en pepoltar_ind
    INSERT INTO pepoltar_ind (
        crecibo, iclaseaseg, casegurado, nmenor, ccerti, ccober, ctarifa, u_version, cramo, cproces, cpoliza, fanopol, fmespol,
        cnpoliza, cnrecibo, csucur, cmoneda, ptasamon, fdesde, fhasta, msumaaseg, msumaasegext, mprima, mprimaext, pprima,
        bfraded, mdedu_fran, mdedu_franext, pdedu_fran, mdescuento, mdescuentoext, pdescuento, mrecargo, mrecargoext, precargo,
        mprimabruta, mprimabrutaext, pcomision, mcomision, mcomisionext, isuma, istattar, cramoint, ccoberturaint, ctarifaint,
        cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod,
        ccategoriamod
    )
    SELECT
        A.crecibo, B.iclaseaseg, B.casegurado, B.nmenor, A.ccerti, A.ccober, A.ctarifa, A.u_version, A.cramo, A.cproces,
        A.cpoliza, A.fanopol, A.fmespol, A.cnpoliza, A.cnrecibo, A.csucur, A.cmoneda, A.ptasamon, A.fdesde, A.fhasta,
        A.msumaaseg, A.msumaasegext, A.mprima, A.mprimaext, A.pprima, A.bfraded, A.mdedu_fran, A.mdedu_franext, A.pdedu_fran,
        A.mdescuento, A.mdescuentoext, A.pdescuento, A.mrecargo, A.mrecargoext, A.precargo, A.mprimabruta, A.mprimabrutaext,
        A.pcomision, A.mcomision, A.mcomisionext, A.isuma, A.istattar, A.cramoint, A.ccoberturaint, A.ctarifaint,
        A.cprog, A.ifuente, A.bok, A.cerror, GETDATE(), 7, 1, NULL, NULL, NULL, NULL, NULL
    FROM adpoltar A WITH (NOLOCK)
    INNER JOIN peasegurados B WITH (NOLOCK) ON A.cpoliza = B.cpoliza AND A.fanopol = B.fanopol AND A.fmespol = B.fmespol
    WHERE A.cpoliza = @cpoliza AND A.fanopol = @fanopol AND A.fmespol = @fmespol;

    -- Validar y asegurar el registro de tetitcer para control de certificados (Sintaxis original compatible)
    IF NOT EXISTS (SELECT 1 FROM tetitcer WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol AND ccerti = 0)
    BEGIN
        INSERT INTO tetitcer
        SELECT
            a.cpoliza, a.fanopol, a.fmespol, 0, a.u_version, a.cramo, itipoprod, cproces, a.casegurado, a.ctenedor, 0, a.cacreedor,
            cbeneficiario, a.cproductor, itiporen, iestadoren, 'V', a.fdesde, a.fhasta, forigen, cprog, ifuente, bok, cerror, a.fingreso,
            a.cusuario, a.ccategoria, a.cusuarioauto, a.ccategoriaauto, a.fultmod, a.cusuariomod, a.ccategoriamod
        FROM adpoliza a WITH (NOLOCK)
        WHERE A.cpoliza = @cpoliza AND A.fanopol = @fanopol AND a.fmespol = @fmespol;
    END

END;
