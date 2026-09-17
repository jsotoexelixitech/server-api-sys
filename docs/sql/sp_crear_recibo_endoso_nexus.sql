-- Endoso: crear recibo(s) fraccionados + actualizar plan/frecuencia en adpoliza (misma transacción).
-- La cantidad de recibos la manda la frecuencia (M=12, T=4, C=3, S=2, A/E=1), igual que la emisión
-- nativa spGeneraCoberturasYRecibos_Auto_RCV2. @ncuotas solo se usa si no llega @ifrecuencia.
-- @mprima = prima total del endoso, expresada en la moneda de la póliza (adpoliza.cmoneda).
-- Recibos cobrados (iestadorec='C') que aún están vigentes se cortan: fhasta = @fdesde.
-- Coberturas: el cuadro sale del tarifador (sp_calculo_auto_nexus), igual que la emisión nativa.
-- El tarifador decide qué coberturas aplican según @coberAdicional (RC = solo RCV, CA/PT = casco)
-- y devuelve la suma asegurada de cada una para el plan destino. maplantar/matarifa solo aportan
-- los datos de tarifa. Si el tarifador no devuelve nada (ramo distinto de automóvil o vehículo
-- sin catálogo) se cae al catálogo del plan heredando la suma del cuadro anterior.
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
    -- Parámetros del tarifador. @coberAdicional: 'RC' solo RCV, 'CA' casco amplia, 'PT' pérdida
    -- total. Si no llega se resuelve desde TMEMISION_AUTOMOVIL_RCV2 o del cuadro anterior.
    @coberAdicional   VARCHAR(2) = NULL,
    @msumaaseg        NUMERIC(18, 2) = NULL,
    @tasaCa           NUMERIC(18, 2) = 0,
    @tasaPt           NUMERIC(18, 2) = 0,
    @tasaPp           NUMERIC(18, 2) = 0,
    @precargorcv      NUMERIC(18, 2) = 0,
    @ntoneladas       INT = 0,
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
            @polCusuario    INT,
            @cusuarioTar    INT,
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
            @sqlCert        NVARCHAR(MAX),
            @cmarca         VARCHAR(4),
            @cmodelo        VARCHAR(4),
            @cversion       VARCHAR(3),
            @cano           INT,
            @tipoV          INT,
            @uso            INT,
            @puestos        INT,
            @iplaca         CHAR(1),
            @cntMontos      INT,
            @creciboRef     NUMERIC(19, 0),
            @sumaRefCasco   NUMERIC(18, 2),
            @sumaPesos      NUMERIC(18, 6),
            @cuotaPrimaPol  NUMERIC(18, 2),
            @restoCobPol    NUMERIC(18, 2),
            @idxMayorPeso   INT,
            @preservarCasco BIT,
            @primaCascoRefPol NUMERIC(18, 2),
            @idxMayorPesoRcv INT,
            @poolRcv        NUMERIC(18, 2),
            @sumaCascoCuota NUMERIC(18, 2),
            @factorCuota    NUMERIC(18, 6);

        -- Temp tables al inicio: evita DECLARE de table-variable a mitad del SP (SSMS/parseo).
        CREATE TABLE #cobs (
            ccober          INT            NOT NULL,
            ctarifa         CHAR(4)        NULL,
            ccoberimp       CHAR(4)        NULL,
            ietiqtarimp     CHAR(1)        NULL,
            qordenimp       SMALLINT       NULL,
            ctarifaint      CHAR(4)        NULL,
            msuma_pol       NUMERIC(18, 2) NOT NULL,
            -- Prima de la cobertura en la cuota que se está generando (moneda de la póliza).
            prima_cuota     NUMERIC(18, 2) NOT NULL DEFAULT 0,
            pprima          NUMERIC(18, 6) NULL,
            bfraded         CHAR(1)        NULL,
            mdedu_fran      NUMERIC(18, 2) NULL,
            mdedu_franext   NUMERIC(18, 2) NULL,
            pdedu_fran      NUMERIC(18, 6) NULL,
            isuma           CHAR(1)        NULL,
            cramoint        INT            NULL,
            ccoberturaint   INT            NULL,
            bprimarea       BIT            NULL,
            ccontrea        SMALLINT       NULL,
            cramorea        INT            NULL,
            cramopcnd       INT            NULL,
            ccoberpcnd      INT            NULL,
            -- Peso para repartir la prima del endoso: prima que el tarifador da a la cobertura.
            peso            NUMERIC(18, 6) NOT NULL DEFAULT 0,
            idx             INT            IDENTITY(1, 1) NOT NULL
        );

        -- Estructura exacta que devuelve sp_calculo_auto_nexus (igual que sp_genera_coberturas_endoso_nexus).
        CREATE TABLE #montos (
            cplan           CHAR(50),
            xplan           CHAR(70),
            ccobertura      CHAR(4),
            xdescripcion_l  CHAR(60),
            cproducto       NVARCHAR(6),
            cmoneda         CHAR(10),
            nubii           NUMERIC(6),
            tasaCA          NUMERIC(18, 6),
            tasaPT          NUMERIC(18, 6),
            tasaPP          DECIMAL(18, 2),
            primaBlCA       NUMERIC(18, 6),
            primaBLPT       NUMERIC(18, 6),
            primaAdCA       NUMERIC(18, 6),
            primaAdPT       NUMERIC(18, 6),
            primaAdPP       NUMERIC(18, 6),
            prima           NUMERIC(18, 6),
            masegurada      NUMERIC(18, 6),
            ctarifa         CHAR(4),
            cramoint        CHAR(4),
            ccoberturaint   CHAR(4),
            xcobertura      NVARCHAR(30),
            xvalor          NVARCHAR(2),
            badicional      BIT
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
            @polCplan      = cplan,
            @polCusuario   = cusuario
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

        -- 4b. Cuadro de coberturas del endoso. El tarifador manda: decide qué coberturas del plan
        -- aplican y con qué suma asegurada, igual que la emisión nativa. Sin él el cuadro sale con
        -- todas las coberturas de maplantar (casco incluido) y con la suma del plan anterior.
        IF @coberAdicional IS NOT NULL
            SET @coberAdicional = NULLIF(LTRIM(RTRIM(@coberAdicional)), '');

        IF @coberAdicional IS NULL
            SELECT TOP 1 @coberAdicional = NULLIF(LTRIM(RTRIM(cober_adicional)), '')
            FROM TMEMISION_AUTOMOVIL_RCV2
            WHERE LTRIM(RTRIM(cnpoliza)) = @cleanCnpoliza
            ORDER BY id DESC;

        -- Cuadro de referencia para saber qué tenía contratado la póliza. No se puede exigir
        -- iestadorec='C' ni iestado='V': la emisión nativa (Emi_Auto) deja el recibo en 'P' y sus
        -- adpolcob en 'N' hasta que se cobra, y el backend de endosos anula el recibo anterior
        -- antes de llamar a este SP. Por eso se prefiere el cuadro vivo más reciente y, si no
        -- queda ninguno, se cae al anulado más reciente.
        SELECT TOP 1 @creciboRef = crecibo
        FROM (
            SELECT
                r.crecibo,
                r.fdesde,
                CASE WHEN r.iestadorec = 'A' THEN 1 ELSE 0 END AS prioridad
            FROM adrecibos r
            WHERE r.cpoliza = @cpoliza
              AND EXISTS (
                  SELECT 1 FROM adpolcob pc
                  WHERE pc.crecibo = r.crecibo AND pc.iestado <> 'A'
              )
        ) ref
        ORDER BY prioridad, fdesde DESC, crecibo DESC;

        IF @coberAdicional IS NULL AND @creciboRef IS NOT NULL
        BEGIN
            -- Cobertura 1 = amplia, 2 = pérdida total, 28 = pérdida parcial. Sin casco es RCV.
            IF EXISTS (SELECT 1 FROM adpolcob WHERE crecibo = @creciboRef AND ccober = 1 AND iestado <> 'A')
                SET @coberAdicional = 'CA';
            ELSE IF EXISTS (SELECT 1 FROM adpolcob WHERE crecibo = @creciboRef AND ccober = 2 AND iestado <> 'A')
                SET @coberAdicional = 'PT';
            ELSE IF EXISTS (SELECT 1 FROM adpolcob WHERE crecibo = @creciboRef AND ccober = 28 AND iestado <> 'A')
                SET @coberAdicional = 'PP';
        END

        SET @coberAdicional = ISNULL(@coberAdicional, 'RC');

        -- La suma asegurada del casco se conserva: el endoso cambia el plan, no el valor del vehículo.
        IF ISNULL(@msumaaseg, 0) = 0 AND @creciboRef IS NOT NULL AND @coberAdicional <> 'RC'
        BEGIN
            SELECT TOP 1 @sumaRefCasco = msumaasegext
            FROM adpolcob
            WHERE crecibo = @creciboRef AND ccober IN (1, 2, 28) AND iestado <> 'A'
              AND ISNULL(msumaasegext, 0) > 0
            ORDER BY ccober;

            SET @msumaaseg = NULLIF(@sumaRefCasco, 0);
        END

        -- El tarifador consulta fn_validateCoberAccess para saber si el usuario puede cotizar casco;
        -- si no puede, borra del cuadro las coberturas 1/2/3/4/5/16/28. La emisión corrió con el
        -- usuario de la póliza, así que el endoso usa ese mismo usuario y no pierde la amplia.
        SET @cusuarioTar = @cusuario;

        IF @coberAdicional <> 'RC' AND ISNULL(@polCusuario, 0) <> 0
           AND dbo.fn_validateCoberAccess(
                   @cusuarioTar,
                   (SELECT TOP 1 LTRIM(RTRIM(cproducto)) FROM maplanes WHERE cplan = @cplanRecibo AND cramo = @cramo),
                   @coberAdicional) = 0
            SET @cusuarioTar = @polCusuario;

        -- Datos del vehículo para el tarifador (mismo camino que sp_genera_coberturas_endoso_nexus).
        SELECT TOP 1
            @cmarca   = LTRIM(RTRIM(cmarca)),
            @cmodelo  = LTRIM(RTRIM(cmodelo)),
            @cversion = LTRIM(RTRIM(cversion)),
            @cano     = cano
        FROM vhcerti
        WHERE cpoliza = @cpoliza;

        IF @cmarca IS NOT NULL
        BEGIN
            SET @iplaca = 'N';
            SET @puestos = 5;
            SET @uso = 1;

            IF EXISTS (
                SELECT 1 FROM vinma
                WHERE cmarca = @cmarca AND cmodelo = @cmodelo
                  AND cversion = @cversion AND cano = @cano
            )
                SELECT TOP 1
                    @tipoV   = ctipo,
                    @uso     = CASE WHEN ISNULL(ccategotr, 0) > 0 THEN ccategotr ELSE @uso END,
                    @puestos = CASE WHEN ISNULL(npasajero, 0) > 0 THEN npasajero ELSE @puestos END
                FROM vinma
                WHERE cmarca = @cmarca AND cmodelo = @cmodelo
                  AND cversion = @cversion AND cano = @cano;
            ELSE
                SELECT TOP 1 @tipoV = ctipo FROM macategtr WHERE ccategotr = @uso;

            SET @tipoV = ISNULL(@tipoV, 1);

            INSERT INTO #montos
            EXEC sp_calculo_auto_nexus
                @cmarca         = @cmarca,
                @cmodelo        = @cmodelo,
                @cversion       = @cversion,
                @cano           = @cano,
                @cplan          = @cplanRecibo,
                @sumaAseg       = @msumaaseg,
                @sumaAsegBl     = @msumaaseg,
                @sumaAsegAd     = 0,
                @iplaca         = @iplaca,
                @fdesde         = @fdesde,
                @fhasta         = @fhasta,
                @tasaPt         = @tasaPt,
                @tasaCa         = @tasaCa,
                @tasaPp         = @tasaPp,
                @recargo        = 0,
                @tipoV          = @tipoV,
                @uso            = @uso,
                @puestos        = @puestos,
                @toneladas      = @ntoneladas,
                @recargoRcv     = @precargorcv,
                @cramo          = @cramo,
                @cusuario       = @cusuarioTar,
                @coberAdicional = @coberAdicional,
                @incluirTotales = 0,
                @ifrecuencia    = @ifrecuencia;
        END

        SELECT @cntMontos = COUNT(*) FROM #montos;

        IF @cntMontos > 0
        BEGIN
            -- Suma asegurada y peso de prima salen del tarifador; la tarifa, de maplantar/matarifa.
            INSERT INTO #cobs (
                ccober, ctarifa, ccoberimp, ietiqtarimp, qordenimp, ctarifaint,
                msuma_pol, pprima, bfraded, mdedu_fran, mdedu_franext, pdedu_fran,
                isuma, cramoint, ccoberturaint, bprimarea,
                ccontrea, cramorea, cramopcnd, ccoberpcnd, peso
            )
            SELECT
                A.ccober,
                A.ctarifa,
                C.ccoberimp,
                C.ietiqtarimp,
                C.qordenimp,
                C.ctarifaint,
                ISNULL(m.masegurada, 0),
                fd.pprima,
                fd.bfraded,
                fd.mdedu_fran,
                fd.mdedu_franext,
                fd.pdedu_fran,
                e.isuma,
                e.cramoint,
                e.ccoberturaint,
                C.bprimarea,
                e.ccontrea,
                e.cramorea,
                e.cramopcnd,
                e.ccoberpcnd,
                ISNULL(m.prima, 0)
            FROM maplantar A
            INNER JOIN maarancel B ON A.ccober = B.ccober AND A.cramo = B.cramo AND B.iestado = 'V'
            INNER JOIN matarifa C ON A.ccober = C.ccober AND A.cramo = C.cramo AND A.ctarifa = C.ctarifa
            INNER JOIN macoberturas e ON e.ccobertura = C.ccober AND e.cramo = C.cramo
            LEFT JOIN matarifa_d fd ON fd.ccober = C.ccober AND fd.cramo = C.cramo AND fd.ctarifa = C.ctarifa
            INNER JOIN #montos m
                ON LTRIM(RTRIM(m.ccobertura)) = LTRIM(RTRIM(A.ccober)) COLLATE Modern_Spanish_CI_AS
               AND LTRIM(RTRIM(m.ctarifa)) = LTRIM(RTRIM(A.ctarifa)) COLLATE Modern_Spanish_CI_AS
            WHERE A.cramo = @cramo
              AND RTRIM(A.cplan) = RTRIM(@cplanRecibo);
        END
        ELSE
        BEGIN
        -- Sin tarifador (ramo distinto de automóvil): catálogo del plan y suma del cuadro anterior.
        INSERT INTO #cobs (
            ccober, ctarifa, ccoberimp, ietiqtarimp, qordenimp, ctarifaint,
            msuma_pol, pprima, bfraded, mdedu_fran, mdedu_franext, pdedu_fran,
            isuma, cramoint, ccoberturaint, bprimarea,
            ccontrea, cramorea, cramopcnd, ccoberpcnd
        )
        SELECT
            A.ccober,
            A.ctarifa,
            -- ccoberimp/ietiqtarimp/qordenimp/ctarifaint viven en matarifa, no en maplantar.
            C.ccoberimp,
            C.ietiqtarimp,
            C.qordenimp,
            C.ctarifaint,
            CASE WHEN @esBs = 1 THEN ISNULL(prev.msumaaseg, 0) ELSE ISNULL(prev.msumaasegext, 0) END,
            fd.pprima,
            fd.bfraded,
            fd.mdedu_fran,
            fd.mdedu_franext,
            fd.pdedu_fran,
            e.isuma,
            e.cramoint,
            e.ccoberturaint,
            C.bprimarea,
            -- Contrato/ramo de reaseguro: obligatorio para sp_genera_adpolrea_nexus / adpolrea.
            e.ccontrea,
            e.cramorea,
            e.cramopcnd,
            e.ccoberpcnd
        FROM maplantar A
        INNER JOIN maarancel B ON A.ccober = B.ccober AND A.cramo = B.cramo AND B.iestado = 'V'
        INNER JOIN matarifa C ON A.ccober = C.ccober AND A.cramo = C.cramo AND A.ctarifa = C.ctarifa
        INNER JOIN macoberturas e ON e.ccobertura = C.ccober AND e.cramo = C.cramo
        LEFT JOIN matarifa_d fd ON fd.ccober = C.ccober AND fd.cramo = C.cramo AND fd.ctarifa = C.ctarifa
        LEFT JOIN (
            -- Cuadro anterior (aún sin anular en este punto del SP).
            SELECT
                pc.ccober,
                pc.msumaaseg,
                pc.msumaasegext,
                ROW_NUMBER() OVER (PARTITION BY pc.ccober ORDER BY pc.crecibo DESC) AS rn
            FROM adpolcob pc
            INNER JOIN adrecibos r ON r.crecibo = pc.crecibo
            WHERE r.cpoliza = @cpoliza
        ) prev ON prev.ccober = A.ccober AND prev.rn = 1
        WHERE A.cramo = @cramo
          AND RTRIM(A.cplan) = RTRIM(@cplanRecibo)
          -- Solo RCV: sin tarifador no arrastrar casco del catálogo del plan.
          AND (
              @coberAdicional <> 'RC'
              OR A.ccober NOT IN (1, 2, 3, 4, 5, 16, 28)
          );
        END

        -- Pesos para repartir la prima: los da el tarifador, así las coberturas caras cargan la
        -- mayor parte. Sin tarifador el reparto es igualitario.
        SELECT @cntCobs = COUNT(*) FROM #cobs;
        SELECT @sumaPesos = SUM(peso) FROM #cobs;

        IF @cntCobs > 0 AND ISNULL(@sumaPesos, 0) <= 0
        BEGIN
            UPDATE #cobs SET peso = 1;
            SET @sumaPesos = @cntCobs;
        END

        -- Plan upgrade RCV con casco ya contratado: suma y prima de casco del recibo de referencia.
        SET @preservarCasco = 0;
        SET @primaCascoRefPol = 0;

        IF @coberAdicional <> 'RC' AND @creciboRef IS NOT NULL
            SET @preservarCasco = 1;

        IF @preservarCasco = 1
        BEGIN
            UPDATE c
            SET
                c.msuma_pol = CASE
                    WHEN @esBs = 1 THEN ISNULL(ref.msumaaseg, c.msuma_pol)
                    ELSE ISNULL(ref.msumaasegext, c.msuma_pol)
                END,
                c.peso = 0
            FROM #cobs c
            INNER JOIN adpolcob ref
                ON ref.ccober = c.ccober
               AND ref.crecibo = @creciboRef
               AND ref.iestado <> 'A'
            WHERE c.ccober IN (1, 2, 3, 4, 5, 16, 28);

            SELECT @primaCascoRefPol = ISNULL(SUM(
                CASE WHEN @esBs = 1 THEN ref.mprimabruta ELSE ref.mprimabrutaext END
            ), 0)
            FROM adpolcob ref
            WHERE ref.crecibo = @creciboRef
              AND ref.iestado <> 'A'
              AND ref.ccober IN (1, 2, 3, 4, 5, 16, 28);
        END

        -- El residuo del redondeo se carga a la cobertura de mayor peso.
        SELECT TOP 1 @idxMayorPeso = idx FROM #cobs ORDER BY peso DESC, idx;
        SELECT TOP 1 @idxMayorPesoRcv = idx
        FROM #cobs
        WHERE ccober NOT IN (1, 2, 3, 4, 5, 16, 28)
        ORDER BY peso DESC, idx;

        -- 5. Anular coberturas de recibos pendientes y luego los recibos (mismo período).
        -- iestado <> 'A' y no = 'V': la emisión nativa deja las coberturas en 'N' hasta el cobro.
        UPDATE adpolcob
        SET iestado = 'A'
        WHERE iestado <> 'A'
          AND EXISTS (
              SELECT 1
              FROM adrecibos r
              WHERE r.crecibo = adpolcob.crecibo
                AND r.cpoliza = @cpoliza
                AND r.fanopol = @polFanopol
                AND r.fmespol = @polFmespol
                AND r.iestadorec = 'P'
          );

        UPDATE adpoltar
        SET istattar = 'A'
        WHERE istattar = 'V'
          AND EXISTS (
              SELECT 1
              FROM adrecibos r
              WHERE r.crecibo = adpoltar.crecibo
                AND r.cpoliza = @cpoliza
                AND r.fanopol = @polFanopol
                AND r.fmespol = @polFmespol
                AND r.iestadorec = 'P'
          );

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

        -- 5c. Cerrar el cuadro del recibo cobrado en la misma fecha (evita doble conteo en PDF).
        UPDATE pc
        SET pc.fhasta = @fdesde
        FROM adpolcob pc
        INNER JOIN adrecibos r ON r.crecibo = pc.crecibo
        WHERE r.cpoliza = @cpoliza
          AND r.fanopol = @polFanopol
          AND r.fmespol = @polFmespol
          AND r.iestadorec = 'C'
          AND r.fhasta = @fdesde
          AND pc.iestado <> 'A'
          AND pc.fhasta > @fdesde;

        UPDATE pt
        SET pt.fhasta = @fdesde
        FROM adpoltar pt
        INNER JOIN adrecibos r ON r.crecibo = pt.crecibo
        WHERE r.cpoliza = @cpoliza
          AND r.fanopol = @polFanopol
          AND r.fmespol = @polFmespol
          AND r.iestadorec = 'C'
          AND r.fhasta = @fdesde
          AND pt.istattar <> 'A'
          AND pt.fhasta > @fdesde;

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

            -- Reparto de la prima de ESTA cuota entre las coberturas. Se reparte la prima de la
            -- cuota (no la anual) para que el cuadro sume exactamente la prima del recibo.
            IF @cntCobs > 0
            BEGIN
                SET @cuotaPrimaPol = CASE WHEN @esBs = 1 THEN @cuotaPrimaBs ELSE @cuotaPrimaExt END;

                IF @preservarCasco = 1 AND @primaCascoRefPol > 0 AND @creciboRef IS NOT NULL
                BEGIN
                    SET @factorCuota = @cuotaPrimaPol / NULLIF(@mprimaTotalPol, 0);
                    IF @factorCuota IS NULL OR @factorCuota <= 0
                        SET @factorCuota = 1;

                    UPDATE c
                    SET c.prima_cuota = ROUND(
                        (CASE WHEN @esBs = 1 THEN ref.mprimabruta ELSE ref.mprimabrutaext END)
                        * @factorCuota, 2)
                    FROM #cobs c
                    INNER JOIN adpolcob ref
                        ON ref.ccober = c.ccober
                       AND ref.crecibo = @creciboRef
                       AND ref.iestado <> 'A'
                    WHERE c.ccober IN (1, 2, 3, 4, 5, 16, 28);

                    SELECT @sumaCascoCuota = ISNULL(SUM(prima_cuota), 0) FROM #cobs
                    WHERE ccober IN (1, 2, 3, 4, 5, 16, 28);

                    SET @poolRcv = @cuotaPrimaPol - @sumaCascoCuota;

                    UPDATE #cobs
                    SET prima_cuota = 0
                    WHERE ccober NOT IN (1, 2, 3, 4, 5, 16, 28);

                    SELECT @sumaPesos = ISNULL(SUM(peso), 0) FROM #cobs
                    WHERE ccober NOT IN (1, 2, 3, 4, 5, 16, 28);

                    IF @poolRcv > 0 AND ISNULL(@sumaPesos, 0) > 0
                    BEGIN
                        UPDATE #cobs
                        SET prima_cuota = FLOOR((@poolRcv * peso / @sumaPesos) * 100) / 100
                        WHERE ccober NOT IN (1, 2, 3, 4, 5, 16, 28);

                        SELECT @restoCobPol = @poolRcv - SUM(prima_cuota) FROM #cobs
                        WHERE ccober NOT IN (1, 2, 3, 4, 5, 16, 28);

                        IF @idxMayorPesoRcv IS NOT NULL
                            UPDATE #cobs
                            SET prima_cuota = prima_cuota + @restoCobPol
                            WHERE idx = @idxMayorPesoRcv;
                    END
                END
                ELSE
                BEGIN
                    UPDATE #cobs
                    SET prima_cuota = FLOOR((@cuotaPrimaPol * peso / @sumaPesos) * 100) / 100;

                    SELECT @restoCobPol = @cuotaPrimaPol - SUM(prima_cuota) FROM #cobs;

                    UPDATE #cobs
                    SET prima_cuota = prima_cuota + @restoCobPol
                    WHERE idx = @idxMayorPeso;
                END
            END

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
                    CASE WHEN @esBs = 1 THEN c.prima_cuota ELSE ROUND(c.prima_cuota * @ptasamon, 2) END,
                    CASE WHEN @esBs = 1 THEN ROUND(c.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE c.prima_cuota END,
                    ISNULL(c.pprima, 0),
                    0, 0, 0, 0, 0, 0,
                    CASE WHEN @esBs = 1 THEN c.prima_cuota ELSE ROUND(c.prima_cuota * @ptasamon, 2) END,
                    CASE WHEN @esBs = 1 THEN ROUND(c.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE c.prima_cuota END,
                    ISNULL(c.bprimarea, 0),
                    CASE WHEN @esBs = 1 THEN c.prima_cuota ELSE ROUND(c.prima_cuota * @ptasamon, 2) END,
                    CASE WHEN @esBs = 1 THEN ROUND(c.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE c.prima_cuota END,
                    @pcomision,
                    (CASE WHEN @esBs = 1 THEN c.prima_cuota ELSE ROUND(c.prima_cuota * @ptasamon, 2) END) * @pcomision / 100,
                    (CASE WHEN @esBs = 1 THEN ROUND(c.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE c.prima_cuota END) * @pcomision / 100
                FROM #cobs c
                WHERE c.ctarifa IS NOT NULL;

                -- adpolcob siempre (el PDF de póliza lee esta tabla).
                -- ccontrea/cramorea/cramopcnd/ccoberpcnd: mismos campos que emisión nativa RCV2
                -- (macoberturas); sin ellos sp_genera_adpolrea_nexus falla en adpolrea.ccontrea.
                INSERT INTO adpolcob (
                    crecibo, ccober, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, cnpoliza, cnrecibo, cproces, csucur, cmoneda,
                    ptasamon, fdesde, fhasta, itipoprod, msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision, mcomision,
                    mcomisionext, mprimareas, mprimareasext, iestado, isuma, ccontrea, cramorea, cramopcnd, ccoberpcnd,
                    cramoint, ccoberturaint, cprog, ifuente, bok, cerror,
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
                    CASE WHEN @esBs = 1 THEN c.prima_cuota ELSE ROUND(c.prima_cuota * @ptasamon, 2) END,
                    CASE WHEN @esBs = 1 THEN ROUND(c.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE c.prima_cuota END,
                    @pcomision,
                    (CASE WHEN @esBs = 1 THEN c.prima_cuota ELSE ROUND(c.prima_cuota * @ptasamon, 2) END) * @pcomision / 100,
                    (CASE WHEN @esBs = 1 THEN ROUND(c.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE c.prima_cuota END) * @pcomision / 100,
                    CASE WHEN @esBs = 1 THEN c.prima_cuota ELSE ROUND(c.prima_cuota * @ptasamon, 2) END,
                    CASE WHEN @esBs = 1 THEN ROUND(c.prima_cuota / NULLIF(@ptasamon, 0), 2) ELSE c.prima_cuota END,
                    'V',
                    ISNULL(c.isuma, 'N'),
                    c.ccontrea,
                    c.cramorea,
                    c.cramopcnd,
                    c.ccoberpcnd,
                    ISNULL(c.cramoint, @cramo),
                    ISNULL(c.ccoberturaint, c.ccober),
                    'EndosoRecibo',
                    @ifuente,
                    0,
                    0,
                    GETDATE(),
                    @cusuario,
                    1
                FROM #cobs c;
            END

            EXEC dbo.sp_genera_adpolrea_nexus @crecibo = @newCrecibo;

            SET @cuotaIdx = @cuotaIdx + 1;
            SET @cuotaFdesde = @cuotaFhasta;
        END

        DROP TABLE #cobs;
        DROP TABLE #montos;

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

        IF OBJECT_ID('tempdb..#montos') IS NOT NULL
            DROP TABLE #montos;

        SET @pSuccess = 0;
        SET @pErrorMessage = ERROR_MESSAGE();
    END CATCH
END;
GO
