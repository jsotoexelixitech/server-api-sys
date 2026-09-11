-- Endoso: crear recibo(s) fraccionados + actualizar plan/frecuencia en adpoliza (misma transacción).
-- La cantidad de recibos la manda la frecuencia (M=12, T=4, C=3, S=2, A/E=1), igual que la emisión
-- nativa spGeneraCoberturasYRecibos_Auto_RCV2. @ncuotas solo se usa si no llega @ifrecuencia.
-- @mprima = prima total del endoso, expresada en la moneda de la póliza (adpoliza.cmoneda).
-- Recibos cobrados (iestadorec='C') que aún están vigentes se cortan: fhasta = @fdesde.
-- Coberturas: se insertan adpoltar/adpolcob por cada recibo nuevo (payload JSON o maplantar).
-- Desplegar en Sis2000 QA/prod.

-- DROP + CREATE (en vez de CREATE OR ALTER): DBeaver no detecta "OR ALTER" como inicio de
-- bloque y parte el script en cada ';' del cuerpo (SQL Error 102 near ';').
IF OBJECT_ID(N'dbo.sp_crear_recibo_endoso_nexus', N'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_crear_recibo_endoso_nexus;
GO

CREATE PROCEDURE [dbo].[sp_crear_recibo_endoso_nexus]
    @cnpoliza         NVARCHAR(50),
    @fanopol          INT = NULL,
    @fmespol          INT = NULL,
    @mprima           NUMERIC(18, 2),
    @fdesde           DATE,
    @fhasta           DATE,
    @cplan            NVARCHAR(10) = NULL,
    @ifrecuencia      CHAR(1) = NULL,
    @ncuotas          INT = NULL,
    @cusuario         INT = 1,
    @coberturas_json  NVARCHAR(MAX) = NULL,
    @pCnrecibo        NVARCHAR(30) = NULL OUTPUT,
    @pCrecibo         NUMERIC(19, 0) = NULL OUTPUT,
    @pSuccess         BIT = 0 OUTPUT,
    @pErrorMessage    NVARCHAR(MAX) = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @cleanCnpoliza NVARCHAR(30) = LTRIM(RTRIM(@cnpoliza));

        -- 1. Plantilla de la póliza (adpoliza). Los locales no pueden llamarse igual que los parámetros.
        DECLARE
            @cpoliza        NUMERIC(19, 0),
            @cramo          INT,
            @itipopol       CHAR(1),
            @csucur         INT,
            @csucurrec      INT,
            @criesgo        INT,
            @cpoliza_mae    NUMERIC(19, 0),
            @ccerti_mae     NUMERIC(19, 0),
            @cproces        NUMERIC(18, 0),
            @cmoneda        CHAR(10),
            @ptasamon       NUMERIC(18, 6),
            @casegurado     NUMERIC(19, 0),
            @ctenedor       NUMERIC(19, 0),
            @cbeneficiario  NUMERIC(19, 0),
            @cacreedor      NUMERIC(19, 0),
            @cfinanciera    NUMERIC(19, 0),
            @cproductor     NUMERIC(19, 0),
            @ifuente        CHAR(10),
            @ccanalalt      INT,
            @cscanalalt     INT,
            @ctipocanal     CHAR(1),
            @polFanopol     INT,
            @polFmespol     INT,
            @polFdesde      DATE,
            @polFhasta      DATE,
            @polCplan       NVARCHAR(10),
            @esBs           BIT,
            @cplanRecibo    NVARCHAR(10),
            @ptasamon_pago  NUMERIC(18, 6),
            @itiponegocio   CHAR(2),
            @imodcobro      CHAR(2),
            @ctipoproductor INT,
            @pcomision      NUMERIC(8, 6),
            @ccerti         NUMERIC(19, 0),
            @cdoccob        INT,
            @totalCuotas    INT,
            @monthsPerCuota INT,
            @mprimaTotalExt NUMERIC(18, 2),
            @basePrimaExt   NUMERIC(18, 2),
            @firstPrimaExt  NUMERIC(18, 2),
            @mprimaTotalPol NUMERIC(18, 2),
            @sumPrimaCobs   NUMERIC(18, 2),
            @cntCobs        INT,
            @baseCobPol     NUMERIC(18, 2),
            @firstCobPol    NUMERIC(18, 2),
            @cuotaIdx       INT,
            @firstCnrecibo  NVARCHAR(30),
            @firstCrecibo   NUMERIC(19, 0),
            @newCnrecibo    NVARCHAR(30),
            @newCrecibo     NUMERIC(19, 0),
            @errCounter     INT,
            @cuotaPrimaExt  NUMERIC(18, 2),
            @cuotaPrimaBs   NUMERIC(18, 2),
            @cuotaComExt    NUMERIC(18, 2),
            @cuotaComBs     NUMERIC(18, 2),
            @cuotaFdesde    DATE,
            @cuotaFhasta    DATE,
            @sqlCert        NVARCHAR(MAX);

        -- Temp tables al inicio: evita DECLARE de table-variable a mitad del SP (SSMS/parseo).
        CREATE TABLE #cobs (
            ccober          INT            NOT NULL,
            ctarifa         CHAR(4)        NULL,
            ccoberimp       CHAR(4)        NULL,
            ietiqtarimp     CHAR(1)        NULL,
            qordenimp       SMALLINT       NULL,
            ctarifaint      CHAR(4)        NULL,
            msuma_pol       NUMERIC(18, 2) NOT NULL,
            mprima_anual    NUMERIC(18, 2) NOT NULL,
            pprima          NUMERIC(18, 6) NULL,
            bfraded         CHAR(1)        NULL,
            mdedu_fran      NUMERIC(18, 2) NULL,
            mdedu_franext   NUMERIC(18, 2) NULL,
            pdedu_fran      NUMERIC(18, 6) NULL,
            isuma           CHAR(1)        NULL,
            cramoint        INT            NULL,
            ccoberturaint   INT            NULL,
            bprimarea       BIT            NULL,
            idx             INT            IDENTITY(1, 1) NOT NULL
        );

        SELECT TOP 1
            @cpoliza       = cpoliza,
            @cramo         = cramo,
            @itipopol      = ISNULL(itipopol, 'I'),
            @csucur        = ISNULL(csucur, 1),
            @csucurrec     = ISNULL(csucurrec, 1),
            @criesgo       = ISNULL(criesgo, 3),
            @cpoliza_mae   = ISNULL(cpoliza_mae, 0),
            @ccerti_mae    = ISNULL(ccerti_mae, 0),
            @cproces       = cproces,
            @cmoneda       = cmoneda,
            @ptasamon      = ISNULL(ptasamon, 1.0),
            @casegurado    = casegurado,
            @ctenedor      = ctenedor,
            @cbeneficiario = ISNULL(cbeneficiario, 0),
            @cacreedor     = ISNULL(cacreedor, 0),
            @cfinanciera   = ISNULL(cfinanciera, 0),
            @cproductor    = cproductor,
            @ifuente       = ifuente,
            @ccanalalt     = ccanalalt,
            @cscanalalt    = cscanalalt,
            @ctipocanal    = ctipocanal,
            @polFanopol    = fanopol,
            @polFmespol    = fmespol,
            @polFdesde     = fdesde,
            @polFhasta     = fhasta,
            @polCplan      = cplan
        FROM adpoliza
        WHERE cnpoliza = @cleanCnpoliza
        -- El período pedido se prefiere, no se exige: el llamador puede mandar uno inexistente.
        ORDER BY
            CASE
                WHEN @fanopol IS NOT NULL AND fanopol = @fanopol
                 AND (@fmespol IS NULL OR fmespol = @fmespol) THEN 0
                ELSE 1
            END,
            fanopol DESC, fmespol DESC;

        SET @esBs = 0;
        IF LTRIM(RTRIM(ISNULL(@cmoneda, ''))) = 'Bs'
            SET @esBs = 1;

        IF @cpoliza IS NULL
        BEGIN
            RAISERROR('No se encontró la póliza indicada para generar el recibo de endoso.', 16, 1);
        END

        -- Plan del endoso; si no viene, se conserva el de la póliza.
        SET @cplanRecibo = COALESCE(NULLIF(LTRIM(RTRIM(@cplan)), ''), @polCplan);

        -- 2. Datos que solo viven a nivel de recibo: se heredan del último recibo de la póliza.
        SELECT TOP 1
            @ptasamon_pago  = ptasamon_pago,
            @itiponegocio   = itiponegocio,
            @imodcobro      = imodcobro,
            @ctipoproductor = ctipoproductor,
            @pcomision      = pcomision,
            @ccerti         = ccerti,
            @cdoccob        = cdoccob
        FROM adrecibos
        WHERE cpoliza = @cpoliza
        ORDER BY crecibo DESC;

        SET @ptasamon_pago  = ISNULL(@ptasamon_pago, @ptasamon);
        SET @itiponegocio   = ISNULL(@itiponegocio, 'DI');
        SET @imodcobro      = ISNULL(@imodcobro, 'IN');
        SET @ctipoproductor = ISNULL(@ctipoproductor, 0);
        SET @pcomision      = ISNULL(@pcomision, 0);
        SET @ccerti         = ISNULL(@ccerti, 0);
        SET @cdoccob        = ISNULL(@cdoccob, 0);

        IF @pcomision = 0
            SELECT TOP 1 @pcomision = ISNULL(pcomision, 0)
            FROM maarancel
            WHERE cramo = @cramo AND iestado = 'V';

        -- 3. La frecuencia manda sobre la cantidad de cuotas. Si no llega, se infiere de @ncuotas.
        IF @ifrecuencia IS NOT NULL
            SET @ifrecuencia = UPPER(LTRIM(RTRIM(@ifrecuencia)));

        IF @ifrecuencia IS NULL OR @ifrecuencia = ''
        BEGIN
            IF @ncuotas >= 12     SET @ifrecuencia = 'M';
            ELSE IF @ncuotas >= 4 SET @ifrecuencia = 'T';
            ELSE IF @ncuotas = 3  SET @ifrecuencia = 'C';
            ELSE IF @ncuotas = 2  SET @ifrecuencia = 'S';
            ELSE                  SET @ifrecuencia = 'A';
        END

        SET @totalCuotas = 1;

        IF @ifrecuencia = 'M' SET @totalCuotas = 12;
        ELSE IF @ifrecuencia = 'T' SET @totalCuotas = 4;
        ELSE IF @ifrecuencia = 'C' SET @totalCuotas = 3;
        ELSE IF @ifrecuencia = 'S' SET @totalCuotas = 2;

        SET @monthsPerCuota = 12 / @totalCuotas;

        -- 4. Prima total del endoso en ambas monedas (misma conversión que la emisión nativa).
        IF LTRIM(RTRIM(ISNULL(@cmoneda, ''))) = 'Bs'
            SET @mprimaTotalExt = ROUND(@mprima / NULLIF(@ptasamon, 0), 2);
        ELSE
            SET @mprimaTotalExt = @mprima;

        -- Reparto por cuota: la 1ª absorbe los centavos, igual que el wizard de endosos.
        SET @basePrimaExt  = FLOOR((@mprimaTotalExt / @totalCuotas) * 100) / 100;
        SET @firstPrimaExt = @mprimaTotalExt - (@basePrimaExt * (@totalCuotas - 1));

        -- 4b. Cuadro de coberturas del endoso (payload Nest o catálogo maplantar del plan).
        -- Montos en #cobs = moneda de la póliza (igual que @mprima).
        IF @coberturas_json IS NOT NULL
           AND LEN(LTRIM(RTRIM(@coberturas_json))) > 2
           AND ISJSON(@coberturas_json) = 1
        BEGIN
            INSERT INTO #cobs (
                ccober, ctarifa, ccoberimp, ietiqtarimp, qordenimp, ctarifaint,
                msuma_pol, mprima_anual, pprima, bfraded, mdedu_fran, mdedu_franext, pdedu_fran,
                isuma, cramoint, ccoberturaint, bprimarea
            )
            SELECT
                COALESCE(j.ccobertura, j.ccober),
                mt.ctarifa,
                C.ccoberimp,
                C.ietiqtarimp,
                C.qordenimp,
                C.ctarifaint,
                COALESCE(j.msumaaseg, j.msumaasegurada, j.masegurada, 0),
                COALESCE(j.mprima, j.prima, 0),
                fd.pprima,
                fd.bfraded,
                fd.mdedu_fran,
                fd.mdedu_franext,
                fd.pdedu_fran,
                e.isuma,
                e.cramoint,
                e.ccoberturaint,
                C.bprimarea
            FROM OPENJSON(@coberturas_json) WITH (
                ccobertura      INT            '$.ccobertura',
                ccober          INT            '$.ccober',
                msumaaseg       NUMERIC(18, 2) '$.msumaaseg',
                msumaasegurada  NUMERIC(18, 2) '$.msumaasegurada',
                masegurada      NUMERIC(18, 2) '$.masegurada',
                mprima          NUMERIC(18, 2) '$.mprima',
                prima           NUMERIC(18, 2) '$.prima'
            ) j
            OUTER APPLY (
                SELECT TOP 1 A.ctarifa
                FROM maplantar A
                WHERE A.cramo = @cramo
                  AND RTRIM(A.cplan) = RTRIM(@cplanRecibo)
                  AND A.ccober = COALESCE(j.ccobertura, j.ccober)
            ) mt
            OUTER APPLY (
                -- ccoberimp/ietiqtarimp/qordenimp/ctarifaint viven en matarifa, no en maplantar.
                SELECT TOP 1 t.bprimarea, t.ccoberimp, t.ietiqtarimp, t.qordenimp, t.ctarifaint
                FROM matarifa t
                WHERE t.ccober = COALESCE(j.ccobertura, j.ccober)
                  AND t.cramo = @cramo
                  AND (mt.ctarifa IS NULL OR t.ctarifa = mt.ctarifa)
            ) C
            OUTER APPLY (
                SELECT TOP 1 fd.pprima, fd.bfraded, fd.mdedu_fran, fd.mdedu_franext, fd.pdedu_fran
                FROM matarifa_d fd
                WHERE fd.ccober = COALESCE(j.ccobertura, j.ccober)
                  AND fd.cramo = @cramo
                  AND (mt.ctarifa IS NULL OR fd.ctarifa = mt.ctarifa)
            ) fd
            OUTER APPLY (
                SELECT TOP 1 e.isuma, e.cramoint, e.ccoberturaint
                FROM macoberturas e
                WHERE e.ccobertura = COALESCE(j.ccobertura, j.ccober)
                  AND e.cramo = @cramo
            ) e
            WHERE COALESCE(j.ccobertura, j.ccober) IS NOT NULL;
        END

        IF NOT EXISTS (SELECT 1 FROM #cobs)
           AND @cplanRecibo IS NOT NULL
           AND EXISTS (
               SELECT 1 FROM maplantar
               WHERE cramo = @cramo AND RTRIM(cplan) = RTRIM(@cplanRecibo)
           )
        BEGIN
            INSERT INTO #cobs (
                ccober, ctarifa, ccoberimp, ietiqtarimp, qordenimp, ctarifaint,
                msuma_pol, mprima_anual, pprima, bfraded, mdedu_fran, mdedu_franext, pdedu_fran,
                isuma, cramoint, ccoberturaint, bprimarea
            )
            SELECT
                A.ccober,
                A.ctarifa,
                C.ccoberimp,
                C.ietiqtarimp,
                C.qordenimp,
                C.ctarifaint,
                0,
                0,
                fd.pprima,
                fd.bfraded,
                fd.mdedu_fran,
                fd.mdedu_franext,
                fd.pdedu_fran,
                e.isuma,
                e.cramoint,
                e.ccoberturaint,
                C.bprimarea
            FROM maplantar A
            INNER JOIN maarancel B ON A.ccober = B.ccober AND A.cramo = B.cramo AND B.iestado = 'V'
            INNER JOIN matarifa C ON A.ccober = C.ccober AND A.cramo = C.cramo AND A.ctarifa = C.ctarifa
            INNER JOIN macoberturas e ON e.ccobertura = C.ccober AND e.cramo = C.cramo
            LEFT JOIN matarifa_d fd ON fd.ccober = C.ccober AND fd.cramo = C.cramo AND fd.ctarifa = C.ctarifa
            WHERE A.cramo = @cramo
              AND RTRIM(A.cplan) = RTRIM(@cplanRecibo);
        END

        -- Si el payload no trajo primas, repartir la prima total del endoso en partes iguales.
        SET @mprimaTotalPol = @mprima;
        SELECT @sumPrimaCobs = ISNULL(SUM(mprima_anual), 0), @cntCobs = COUNT(*) FROM #cobs;

        IF @cntCobs > 0 AND @sumPrimaCobs <= 0 AND @mprimaTotalPol > 0
        BEGIN
            SET @baseCobPol = FLOOR((@mprimaTotalPol / @cntCobs) * 100) / 100;
            SET @firstCobPol = @mprimaTotalPol - (@baseCobPol * (@cntCobs - 1));

            UPDATE c
            SET mprima_anual = CASE WHEN c.idx = 1 THEN @firstCobPol ELSE @baseCobPol END
            FROM #cobs c;
        END

        -- 5. Anular coberturas de recibos pendientes y luego los recibos (mismo período).
        UPDATE c
        SET c.iestado = 'A'
        FROM adpolcob c
        INNER JOIN adrecibos r ON r.crecibo = c.crecibo
        WHERE c.iestado = 'V'
          AND r.cpoliza = @cpoliza
          AND r.fanopol = @polFanopol
          AND r.fmespol = @polFmespol
          AND r.iestadorec = 'P';

        UPDATE t
        SET t.istattar = 'A'
        FROM adpoltar t
        INNER JOIN adrecibos r ON r.crecibo = t.crecibo
        WHERE t.istattar = 'V'
          AND r.cpoliza = @cpoliza
          AND r.fanopol = @polFanopol
          AND r.fmespol = @polFmespol
          AND r.iestadorec = 'P';

        UPDATE adrecibos
        SET iestadorec = 'A',
            fanulacion = GETDATE()
        WHERE cpoliza = @cpoliza
          AND fanopol = @polFanopol
          AND fmespol = @polFmespol
          AND iestadorec = 'P';

        -- 5b. Recibos cobrados que siguen vigentes: cortar fhasta en la fecha del endoso.
        -- No se anulan (ya están cobrados); solo se cierra su vigencia para que no se solape
        -- con los recibos adicionales del endoso (ej. 02/09/2026–02/09/2027 → …–@fdesde).
        UPDATE adrecibos
        SET fhasta = @fdesde
        WHERE cpoliza = @cpoliza
          AND fanopol = @polFanopol
          AND fmespol = @polFmespol
          AND iestadorec = 'C'
          AND fdesde <= @fdesde
          AND fhasta > @fdesde;

        -- 6. Generar un recibo por cuota, partiendo la vigencia en tramos de 12/cuotas meses.
        SET @cuotaIdx = 1;
        SET @firstCnrecibo = NULL;
        SET @firstCrecibo = NULL;
        SET @cuotaFdesde = @fdesde;

        WHILE @cuotaIdx <= @totalCuotas
        BEGIN
            SET @newCnrecibo = NULL;
            SET @newCrecibo = NULL;
            SET @errCounter = 0;

            EXEC dbo.sp_calcula_num_contador_nexus
                @cramo = @cramo,
                @itipopol = @itipopol,
                @csucur = @csucur,
                @ccerti_mae = @ccerti_mae,
                @caso = 7,
                @cnrecibo = @newCnrecibo OUTPUT,
                @crecibo = @newCrecibo OUTPUT,
                @cerror = @errCounter OUTPUT;

            IF @newCrecibo IS NULL OR @newCnrecibo IS NULL
            BEGIN
                RAISERROR('Fallo al generar número de recibo por sp_calcula_num_contador_nexus.', 16, 1);
            END

            IF @firstCnrecibo IS NULL
            BEGIN
                SET @firstCnrecibo = LTRIM(RTRIM(@newCnrecibo));
                SET @firstCrecibo = @newCrecibo;
            END

            IF @cuotaIdx = 1
                SET @cuotaPrimaExt = @firstPrimaExt;
            ELSE
                SET @cuotaPrimaExt = @basePrimaExt;

            SET @cuotaPrimaBs  = ROUND(@cuotaPrimaExt * @ptasamon, 2);
            SET @cuotaComExt   = ROUND(@cuotaPrimaExt * @pcomision / 100, 2);
            SET @cuotaComBs    = ROUND(@cuotaPrimaBs * @pcomision / 100, 2);

            -- La última cuota cierra en la vigencia del endoso; los tramos nunca la sobrepasan.
            IF @cuotaIdx = @totalCuotas
                SET @cuotaFhasta = @fhasta;
            ELSE
                SET @cuotaFhasta = CONVERT(DATE, DATEADD(MM, @monthsPerCuota, @cuotaFdesde));

            IF @cuotaFhasta > @fhasta
                SET @cuotaFhasta = @fhasta;

            INSERT INTO adrecibos (
                crecibo, u_version, cnpoliza, cnrecibo, cpoliza, fanopol, fmespol, cramo, itipoprod, itiponegocio, itipopol,
                iestadoren, cpoliza_mae, ccerti_mae, itiporec, imodcobro, cdoccob, csucur, csucurrec, criesgo, ccerti, cproces,
                cserie_rea, casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera, cplan, cproductor, ctipoproductor,
                cmoneda, ptasamon, ptasamon_pago, femision, fdesde, fhasta, fdesde_pol, fhasta_pol,
                itipoanul, nlote, iestcont, fcobro, iestadorec, ifinanciado, idevolucion, iformadevo,
                mprimabruta, mprimabrutaext, mprimaneta, mprimanetaext, pretcoa, pcomision, mcomision, mcomisionext,
                mmontorec, mmontorecext, mabono, mabonoext, mmontoapag, mmontoapagext,
                fpago, mpagado, mpagadoext, mpendiente, mpendientext,
                itipocta, itarjeta, qcuotas, cprog, ifuente, fingreso, cusuario,
                ifrecuencia, cnrecibo_rel, ccanalalt, cscanalalt, ctipocanal
            )
            VALUES (
                -- itiporec = 'A' (Adicional): la prima del endoso no es de primer año ni renovación.
                @newCrecibo, '!', @cleanCnpoliza, LTRIM(RTRIM(@newCnrecibo)), @cpoliza, @polFanopol, @polFmespol, @cramo, 'NU', @itiponegocio, @itipopol,
                'N', @cpoliza_mae, @ccerti_mae, 'A', @imodcobro, @cdoccob, @csucur, @csucurrec, @criesgo, @ccerti, @cproces,
                0, @casegurado, @ctenedor, @cbeneficiario, @cacreedor, @cfinanciera, @cplanRecibo, @cproductor, @ctipoproductor,
                @cmoneda, @ptasamon, @ptasamon_pago, GETDATE(), @cuotaFdesde, @cuotaFhasta, ISNULL(@polFdesde, @fdesde), ISNULL(@polFhasta, @fhasta),
                'N', 0, 'P', NULL, 'P', 0, 'P', 'N',
                @cuotaPrimaBs, @cuotaPrimaExt, @cuotaPrimaBs, @cuotaPrimaExt, 100, @pcomision, @cuotaComBs, @cuotaComExt,
                @cuotaPrimaBs, @cuotaPrimaExt, 0, 0, @cuotaPrimaBs, @cuotaPrimaExt,
                NULL, 0, 0, 0, 0,
                'N', 'N', @cuotaIdx, 'EndosoRecibo', @ifuente, GETDATE(), @cusuario,
                @ifrecuencia, NULL, @ccanalalt, @cscanalalt, @ctipocanal
            );

            -- 6b. Coberturas del recibo (adpoltar + adpolcob). Sin esto el PDF sale con cuadro vacío
            -- cuando se anularon los pendientes (y sus adpolcob).
            IF EXISTS (SELECT 1 FROM #cobs)
            BEGIN
                -- Tarifas solo cuando el plan trae ctarifa en maplantar.
                INSERT INTO adpoltar (
                    crecibo, ccober, ctarifa, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, ccoberimp, ietiqtarimp, qordenimp,
                    cnpoliza, cnrecibo, cproces, csucur, cmoneda, ptasamon, itipoprod, fdesde, fhasta, itiporiesg, priesg,
                    bfraded, mdedu_fran, mdedu_franext, pdedu_fran, istattar, isuma, cramoint, ccoberturaint, ctarifaint,
                    cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria,
                    msumabruta, msumabrutaext, msumaaseg, msumaasegext, mprima, mprimaext, pprima,
                    pdescuento, mdescuento, mdescuentoext, precargo, mrecargo, mrecargoext,
                    mprimabruta, mprimabrutaext, bprimarea, mprimareas, mprimareasext, pcomision, mcomision, mcomisionext
                )
                SELECT
                    @newCrecibo,
                    c.ccober,
                    c.ctarifa,
                    '!',
                    @cramo,
                    @cpoliza,
                    @polFanopol,
                    @polFmespol,
                    @ccerti,
                    ISNULL(c.ccoberimp, c.ccober),
                    ISNULL(c.ietiqtarimp, 'N'),
                    ISNULL(c.qordenimp, c.idx),
                    @cleanCnpoliza,
                    LTRIM(RTRIM(@newCnrecibo)),
                    @cproces,
                    @csucur,
                    @cmoneda,
                    @ptasamon,
                    'NU',
                    @cuotaFdesde,
                    @cuotaFhasta,
                    'N',
                    0,
                    ISNULL(c.bfraded, 'N'),
                    ISNULL(c.mdedu_fran, 0),
                    ISNULL(c.mdedu_franext, 0),
                    ISNULL(c.pdedu_fran, 0),
                    'V',
                    ISNULL(c.isuma, 'N'),
                    ISNULL(c.cramoint, @cramo),
                    ISNULL(c.ccoberturaint, c.ccober),
                    ISNULL(c.ctarifaint, c.ctarifa),
                    'EndosoRecibo',
                    @ifuente,
                    0,
                    0,
                    GETDATE(),
                    @cusuario,
                    1,
                    CASE WHEN @esBs = 1 THEN c.msuma_pol ELSE ROUND(c.msuma_pol * @ptasamon, 2) END,
                    CASE WHEN @esBs = 1 THEN ROUND(c.msuma_pol / NULLIF(@ptasamon, 0), 2) ELSE c.msuma_pol END,
                    CASE WHEN @esBs = 1 THEN c.msuma_pol ELSE ROUND(c.msuma_pol * @ptasamon, 2) END,
                    CASE WHEN @esBs = 1 THEN ROUND(c.msuma_pol / NULLIF(@ptasamon, 0), 2) ELSE c.msuma_pol END,
                    CASE WHEN @esBs = 1 THEN x.prima_cuota ELSE ROUND(x.prima_cuota * @ptasamon, 2) END,
                    CASE WHEN @esBs = 1 THEN ROUND(x.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE x.prima_cuota END,
                    ISNULL(c.pprima, 0),
                    0, 0, 0, 0, 0, 0,
                    CASE WHEN @esBs = 1 THEN x.prima_cuota ELSE ROUND(x.prima_cuota * @ptasamon, 2) END,
                    CASE WHEN @esBs = 1 THEN ROUND(x.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE x.prima_cuota END,
                    ISNULL(c.bprimarea, 0),
                    CASE WHEN @esBs = 1 THEN x.prima_cuota ELSE ROUND(x.prima_cuota * @ptasamon, 2) END,
                    CASE WHEN @esBs = 1 THEN ROUND(x.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE x.prima_cuota END,
                    @pcomision,
                    (CASE WHEN @esBs = 1 THEN x.prima_cuota ELSE ROUND(x.prima_cuota * @ptasamon, 2) END) * @pcomision / 100,
                    (CASE WHEN @esBs = 1 THEN ROUND(x.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE x.prima_cuota END) * @pcomision / 100
                FROM #cobs c
                CROSS APPLY (
                    SELECT CASE WHEN @cuotaIdx = 1
                        THEN ROUND(c.mprima_anual - (FLOOR((c.mprima_anual / @totalCuotas) * 100) / 100) * (@totalCuotas - 1), 2)
                        ELSE FLOOR((c.mprima_anual / @totalCuotas) * 100) / 100
                    END AS prima_cuota
                ) x
                WHERE c.ctarifa IS NOT NULL;

                -- adpolcob siempre (el PDF de póliza lee esta tabla).
                INSERT INTO adpolcob (
                    crecibo, ccober, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, cnpoliza, cnrecibo, cproces, csucur, cmoneda,
                    ptasamon, fdesde, fhasta, itipoprod, msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision, mcomision,
                    mcomisionext, mprimareas, mprimareasext, iestado, isuma, cramoint, ccoberturaint, cprog, ifuente, bok, cerror,
                    fingreso, cusuario, ccategoria
                )
                SELECT
                    @newCrecibo,
                    c.ccober,
                    '!',
                    @cramo,
                    @cpoliza,
                    @polFanopol,
                    @polFmespol,
                    @ccerti,
                    @cleanCnpoliza,
                    LTRIM(RTRIM(@newCnrecibo)),
                    @cproces,
                    @csucur,
                    @cmoneda,
                    @ptasamon,
                    @cuotaFdesde,
                    @cuotaFhasta,
                    'NU',
                    CASE WHEN @esBs = 1 THEN c.msuma_pol ELSE ROUND(c.msuma_pol * @ptasamon, 2) END,
                    CASE WHEN @esBs = 1 THEN ROUND(c.msuma_pol / NULLIF(@ptasamon, 0), 2) ELSE c.msuma_pol END,
                    CASE WHEN @esBs = 1 THEN x.prima_cuota ELSE ROUND(x.prima_cuota * @ptasamon, 2) END,
                    CASE WHEN @esBs = 1 THEN ROUND(x.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE x.prima_cuota END,
                    @pcomision,
                    (CASE WHEN @esBs = 1 THEN x.prima_cuota ELSE ROUND(x.prima_cuota * @ptasamon, 2) END) * @pcomision / 100,
                    (CASE WHEN @esBs = 1 THEN ROUND(x.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE x.prima_cuota END) * @pcomision / 100,
                    CASE WHEN @esBs = 1 THEN x.prima_cuota ELSE ROUND(x.prima_cuota * @ptasamon, 2) END,
                    CASE WHEN @esBs = 1 THEN ROUND(x.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE x.prima_cuota END,
                    'V',
                    ISNULL(c.isuma, 'N'),
                    ISNULL(c.cramoint, @cramo),
                    ISNULL(c.ccoberturaint, c.ccober),
                    'EndosoRecibo',
                    @ifuente,
                    0,
                    0,
                    GETDATE(),
                    @cusuario,
                    1
                FROM #cobs c
                CROSS APPLY (
                    SELECT CASE WHEN @cuotaIdx = 1
                        THEN ROUND(c.mprima_anual - (FLOOR((c.mprima_anual / @totalCuotas) * 100) / 100) * (@totalCuotas - 1), 2)
                        ELSE FLOOR((c.mprima_anual / @totalCuotas) * 100) / 100
                    END AS prima_cuota
                ) x;
            END

            EXEC dbo.spGeneraAdpolrea @crecibo = @newCrecibo;

            SET @cuotaIdx = @cuotaIdx + 1;
            SET @cuotaFdesde = @cuotaFhasta;
        END

        DROP TABLE #cobs;

        -- 7. Actualizar el contrato con el plan y la frecuencia del endoso.
        UPDATE adpoliza
        SET cplan = @cplanRecibo,
            ifrecuencia = @ifrecuencia
        WHERE cpoliza = @cpoliza;

        IF OBJECT_ID(N'dbo.adcertificado', N'U') IS NOT NULL
        BEGIN
            SET @sqlCert = N'
                UPDATE adcertificado
                SET ifrecuencia = @ifrecuencia
                WHERE cpoliza = @cpoliza';
            EXEC sp_executesql
                @sqlCert,
                N'@ifrecuencia CHAR(1), @cpoliza NUMERIC(19,0)',
                @ifrecuencia = @ifrecuencia,
                @cpoliza = @cpoliza;
        END

        SET @pCnrecibo = @firstCnrecibo;
        SET @pCrecibo = @firstCrecibo;
        SET @pSuccess = 1;
        IF @totalCuotas > 1
            SET @pErrorMessage = 'Recibos de endoso creados exitosamente ('
                + CAST(@totalCuotas AS NVARCHAR(10)) + ' cuotas, frecuencia '
                + @ifrecuencia + ').';
        ELSE
            SET @pErrorMessage = 'Recibo de endoso creado exitosamente (frecuencia '
                + @ifrecuencia + ').';

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        IF OBJECT_ID('tempdb..#cobs') IS NOT NULL
            DROP TABLE #cobs;

        SET @pSuccess = 0;
        SET @pErrorMessage = ERROR_MESSAGE();
    END CATCH
END;
GO
