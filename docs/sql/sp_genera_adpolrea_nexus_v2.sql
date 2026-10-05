-- =============================================================================
-- sp_genera_adpolrea_nexus — v2
-- Fecha: 2026-10-05 · Solicitado por: Exélixi (emisión personas vía nest-api)
--
-- Único cambio respecto a la versión vigente en QA:
--   adpolrea.fcobro y adpolrea.fpago_aseg toman el valor del recibo tal cual.
--   Antes: COALESCE(r.fcobro, r.femision) / COALESCE(r.fpago_aseg, r.femision), que ponía
--   fecha de cobro y de pago a un recibo pendiente.
--
-- Aplicar junto con sp_emision_personas_general_nexus v2 (deja el recibo pendiente sin
-- fechas). Requiere que adpolrea.fcobro y adpolrea.fpago_aseg acepten NULL
-- (ver docs/sql/diag-sp-emision-personas-v2.sql).
-- La regla de comisión (productor 80080 = directo = 0) se mantiene igual.
-- =============================================================================
CREATE OR ALTER PROCEDURE [dbo].[sp_genera_adpolrea_nexus]
    @crecibo numeric(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @cproductor numeric(11,0);

    BEGIN TRY
        BEGIN TRAN;

        -- Obtener el productor de la póliza para evaluar canal directo
        SELECT TOP 1 @cproductor = cproductor FROM adrecibos WHERE crecibo = @crecibo;

        -- 1. Consolidar sumatorias en tabla temporal (CTE no puede reutilizarse en UPDATE + INSERT)
        IF OBJECT_ID('tempdb..#Agrupados') IS NOT NULL DROP TABLE #Agrupados;

        SELECT
            ccontrea,
            cramorea,
            SUM(mprimabruta) AS Sum_mprimabruta,
            SUM(mprimabrutaext) AS Sum_mprimabrutaext,
            CASE WHEN @cproductor = 80080 THEN 0.0 ELSE SUM(mcomision) END AS Sum_mcomision,
            CASE WHEN @cproductor = 80080 THEN 0.0 ELSE SUM(mcomisionext) END AS Sum_mcomisionext,
            CASE
                WHEN MAX(CASE WHEN isuma = '>' THEN 1 ELSE 0 END) = 1 THEN MAX(msumaaseg)
                ELSE SUM(msumaaseg)
            END AS Calc_msumaaseg,
            CASE
                WHEN MAX(CASE WHEN isuma = '>' THEN 1 ELSE 0 END) = 1 THEN MAX(msumaasegext)
                ELSE SUM(msumaasegext)
            END AS Calc_msumaasegext
        INTO #Agrupados
        FROM adpolcob
        WHERE crecibo = @crecibo
        GROUP BY ccontrea, cramorea;

        -- 2. Actualizamos los registros existentes masivamente
        UPDATE dest
        SET
            mprimabruta = src.Sum_mprimabruta,
            mprimabrutaext = src.Sum_mprimabrutaext,
            mprimareas = src.Sum_mprimabruta,
            mprimareasext = src.Sum_mprimabrutaext,
            mcomision = src.Sum_mcomision,
            mcomisionext = src.Sum_mcomisionext,
            msumabruta  = src.Calc_msumaaseg,
            msumabrutaext  = src.Calc_msumaasegext,
            msretesp = COALESCE(src.Calc_msumaaseg, 0),
            msretespext = COALESCE(src.Calc_msumaasegext, 0),
            iestado = 'V',
            fdesde_cont = NULL,
            fhasta_cont = NULL
        FROM adpolrea dest
        INNER JOIN #Agrupados src
            ON dest.ccontrea = src.ccontrea
            AND dest.cramorea = src.cramorea
            AND dest.crecibo = @crecibo;

        -- 3. Insertamos los registros nuevos (199 columnas alineadas exactamente)
        INSERT INTO adpolrea
        (
            crecibo, ccontrea, cramorea, u_version, cano_cierre, cmes_cierre, cmoneda_rea,
            fdesde_cont, fhasta_cont, fdesde_org, fhasta_org, fcobro, fpago_aseg, reas_ok,
            cproces, crecibo_org, ctiporamo, icontsust, itipocontalt, ccontalt, cramoalt,
            fanopol, fmespol, cpoliza, cnpoliza, fdesde_pol, fhasta_pol, cserie_rea,
            itipocont, cramo, criesgo, ccerti, cmoneda, cmoneda_origen, mcambio_a_bs,
            ptasamon_pago, qcuotas, fdesde, fhasta, mcomision, mcomisionext, msumabruta,
            msumabrutaext, msumabrutaext_2, mprimabruta, mprimabrutaext, mprimabrutaext_2,
            pcoa, pporret, msumacoa, msumacoaext, msumacoaext_2, mprimacoa, mprimacoaext,
            mprimacoaext_2, msumaneta, msumanetaext, msumanetaext_2, mprimaneta,
            mprimanetaext, mprimanetaext_2, mprimabruta_emi, mprimacoa_emi, mprimaneta_emi,
            mprimareas, mprimareasext, mprimareas_c, mprimareasext_c, mprimareas_n,
            mprimareasext_n, fdesde_dev, fhasta_dev, mprimadev, mprimadevext, mprimadif,
            mprimadifext, msretadic, msretadicext, mpretadic, mpretadicext, mscp1, mscp1ext,
            mpcp1, mpcp1ext, mccp1, mccp1ext, micp1, micp1ext, mscp2, mscp2ext, mpcp2,
            mpcp2ext, mccp2, mccp2ext, micp2, micp2ext, msret, msretext, mpret, mpretext,
            msret1, msret1ext, mpret1, mpret1ext, ms1e, ms1eext, mp1e, mp1eext, mc1e,
            mc1eext, mi1e, mi1eext, ms2e, ms2eext, mp2e, mp2eext, mc2e, mc2eext, mi2e,
            mi2eext, ms3e, ms3eext, mp3e, mp3eext, mc3e, mc3eext, mi3e, mi3eext, ms4e,
            ms4eext, mp4e, mp4eext, mc4e, mc4eext, mi4e, mi4eext, ccontfo, cramofo,
            itipocontfo, msfo, msfoext, mpfo, mpfoext, msforet, msforetext, mpforet,
            mpforetext, mcfo, mcfoext, mifo, mifoext, ccontfo1, cramofo1, itipocontfo1,
            msfo1, msfo1ext, mpfo1, mpfo1ext, msfo1ret, msfo1retext, mpfo1ret, mpfo1retext,
            mcfo1, mcfo1ext, mifo1, mifo1ext, ifpexceso, msfp, msfpext, mpfp, mpfpext,
            mpfpret, mpfpretext, mcfp, mcfpext, mifp, mifpext, msretesp, msretespext,
            mpretesp, mpretespext, ifperrado, iestado, iestadorec, itiporec, nerr_a,
            nerr_f, cprog, ifuente, bok, cerror, fingreso, cusuario, cusuariomod,
            cusuarioauto, ccategoria, ccategoriamod, ccategoriaauto, fultmod
        )
        SELECT
            -- Campos 1 al 41
            @crecibo, src.ccontrea, src.cramorea, '!', 0, 0, r.cmoneda,
            -- v2: fcobro / fpago_aseg del recibo (NULL si está pendiente), sin rellenar con femision
            NULL, NULL, r.fdesde, r.fhasta, r.fcobro, r.fpago_aseg,
            1, r.cproces, 0,
            (SELECT ctiporamo FROM maramos WHERE cramo = r.cramo),
            'N', 'N', 0, 0, r.fanopol, r.fmespol, r.cpoliza, r.cnpoliza,
            r.fdesde, r.fhasta, r.fanopol, 'RET', r.cramo, 0, r.ccerti,
            r.cmoneda, r.cmoneda, r.ptasamon, r.ptasamon, r.qcuotas, r.fdesde, r.fhasta,
            src.Sum_mcomision, src.Sum_mcomisionext,

            -- Campos 42 al 74
            src.Calc_msumaaseg, src.Calc_msumaasegext, 0, src.Sum_mprimabruta, src.Sum_mprimabrutaext, 0,
            0, 100, 0, 0, 0, 0, 0, 0, src.Calc_msumaaseg, src.Calc_msumaasegext, 0,
            src.Sum_mprimabruta, src.Sum_mprimabrutaext, 0, src.Sum_mprimabruta, 0, src.Sum_mprimabruta,
            src.Sum_mprimabruta, src.Sum_mprimabrutaext, 0, 0, 0.00, 0.00, r.fdesde, r.fhasta,
            src.Sum_mprimabruta, src.Sum_mprimabrutaext,

            -- Campos 75 al 82 (8 ceros enteros)
            0, 0, 0, 0, 0, 0, 0, 0,

            -- Campos 83 al 136 (54 ceros decimales)
            0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,
            0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,
            0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,
            0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,
            0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,
            0.00, 0.00, 0.00, 0.00,

            -- Campos 137 al 139 (ccontfo, cramofo, itipocontfo)
            0, 0, 'N',

            -- Campos 140 al 151 (12 ceros decimales)
            0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,

            -- Campos 152 al 154 (ccontfo1, cramofo1, itipocontfo1)
            0, 0, 'N',

            -- Campos 155 al 166 (12 ceros decimales)
            0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,

            -- Campo 167 (ifpexceso)
            0,

            -- Campos 168 al 177 (10 ceros decimales)
            0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,

            -- Campos 178 al 181 (msretesp, msretespext, mpretesp, mpretespext)
            COALESCE(src.Calc_msumaaseg, 0), COALESCE(src.Calc_msumaasegext, 0), src.Sum_mprimabruta, src.Sum_mprimabrutaext,

            -- Campos 182 al 199 (ifperrado hasta fultmod)
            0, 'V', r.iestadorec, r.itiporec, 0, 0, r.cprog, r.ifuente, r.bok,
            r.cerror, r.fingreso, r.cusuario, r.cusuariomod, r.cusuarioauto,
            r.ccategoria, r.ccategoriamod, r.ccategoriaauto, r.fultmod
        FROM #Agrupados src
        INNER JOIN adrecibos r ON r.crecibo = @crecibo
        WHERE NOT EXISTS (
            SELECT 1 FROM adpolrea dest
            WHERE dest.ccontrea = src.ccontrea
              AND dest.cramorea = src.cramorea
              AND dest.crecibo = @crecibo
        );

        COMMIT TRAN;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRAN;
        THROW;
    END CATCH
END;
GO
