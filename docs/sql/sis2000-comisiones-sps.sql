/*
  Comisiones y bonos por intermediario (productor) en Sis2000.
  Los usa nest-api (módulo intermediarios) al configurar un intermediario desde Sis2000.

  - maarancel    comisiones (hoy solo hay filas generales, cproductor = 0)
  - mabonos      bonos por ramo y productor
  - magastosramo gastos de ramo: se usa el SP existente de La Mundial SpActCreGastosRamo (no se crea aquí)

  Mismo estilo que SpActCreGastosRamo: si la fila existe (misma clave) se actualiza; si no, se crea.
  Ambos validan el tope del ramo con la misma regla de spCheckCComissions:
      comisión (máxima: general o del productor) + bonos + gastos de ramo  <=  ppormax del ramo

  Ejecutar completo en Sis2000_QA (DBeaver: Alt+X / SSMS: F5). CREATE OR ALTER: re-ejecutable.
  Los errores de negocio salen con THROW 99001 (nest-api los muestra tal cual al usuario).
*/

------------------------------------------------------------------------------
-- Tope del ramo para un productor en un período (misma regla que spCheckCComissions),
-- excluyendo una fila que se está editando, para validar su nuevo porcentaje.
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[spComisionTopeProductor]
    @cramo INT,
    @cproductor NUMERIC(11, 0),
    @fdesde DATE,
    @fhasta DATE,
    @pcomision NUMERIC(19, 2) OUTPUT,
    @pbono NUMERIC(19, 2) OUTPUT,
    @pgasto NUMERIC(19, 2) OUTPUT,
    @pmax NUMERIC(19, 2) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT @pcomision = COALESCE(MAX(pcomision), 0) FROM maarancel
     WHERE cramo = @cramo AND (cproductor = @cproductor OR cproductor = 0)
       AND ISNULL(iestado, 'V') <> 'N'
       AND CONVERT(DATE, fdesde) <= @fdesde AND CONVERT(DATE, fhasta) >= @fhasta;

    SELECT @pbono = COALESCE(SUM(pbono), 0) FROM mabonos
     WHERE cramo = @cramo AND (cproductor = @cproductor OR cproductor = 0)
       AND ISNULL(iestado, 'V') <> 'N'
       AND CONVERT(DATE, fdesde) <= @fdesde AND CONVERT(DATE, fhasta) >= @fhasta;

    SELECT @pgasto = COALESCE(SUM(pgasto), 0) FROM magastosramo
     WHERE cramo = @cramo AND (cproductor = @cproductor OR cproductor = 0)
       AND ISNULL(iestado, 'V') <> 'N'
       AND CONVERT(DATE, fdesde) <= @fdesde AND CONVERT(DATE, fhasta) >= @fhasta;

    -- Máximo del ramo: el de la fila general (cproductor = 0) vigente más reciente que lo tenga cargado
    SET @pmax = (SELECT TOP (1) ppormax FROM maarancel
                                     WHERE cramo = @cramo AND cproductor = 0 AND ppormax IS NOT NULL
                                     ORDER BY CASE WHEN ISNULL(iestado, 'V') <> 'N' THEN 0 ELSE 1 END, fdesde DESC);
    IF @pmax IS NULL
        SET @pmax = (SELECT TOP (1) ppormax FROM maarancel WHERE cramo = @cramo AND ppormax IS NOT NULL ORDER BY fdesde DESC);
END
GO

------------------------------------------------------------------------------
-- Comisión de un productor por ramo (y opcionalmente plan) en maarancel.
-- Clave: cplan + cramo + ctipoprod + cproductor + ccober + ctarifa + fdesde.
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[spActCreComisionProductor]
    @cplan CHAR(6) = '0',
    @cramo INT,
    @ctipoprod INT = 0,
    @cproductor NUMERIC(11, 0),
    @ccober CHAR(4) = '0',
    @fdesde DATE,
    @fhasta DATE = NULL,
    @pcomision NUMERIC(9, 2),
    @iestado CHAR(1) = 'V',
    @cusuario NUMERIC(11, 0) = NULL,
    @cprog CHAR(20) = 'nest-api'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SELECT @cplan = ISNULL(NULLIF(LTRIM(RTRIM(@cplan)), ''), '0'),
           @ccober = ISNULL(NULLIF(LTRIM(RTRIM(@ccober)), ''), '0'),
           @ctipoprod = ISNULL(@ctipoprod, 0),
           @iestado = ISNULL(@iestado, 'V');
    IF @fhasta IS NULL OR @fhasta <= @fdesde SET @fhasta = DATEADD(YEAR, 20, @fdesde);

    IF ISNULL(@cproductor, 0) = 0
        THROW 99001, 'INDIQUE EL PRODUCTOR (LA COMISION GENERAL NO SE MODIFICA DESDE AQUI)', 1;
    IF NOT EXISTS (SELECT 1 FROM maproduc WHERE cproductor = @cproductor)
        THROW 99001, 'EL PRODUCTOR NO EXISTE', 1;
    IF NOT EXISTS (SELECT 1 FROM maramos WHERE cramo = @cramo)
        THROW 99001, 'EL RAMO NO EXISTE', 1;
    IF @pcomision IS NULL OR @pcomision <= 0 OR @pcomision > 100
        THROW 99001, 'EL PORCENTAJE DE COMISION DEBE ESTAR ENTRE 0 Y 100', 1;
    IF @iestado NOT IN ('V', 'N')
        THROW 99001, 'ESTADO INVALIDO (V o N)', 1;

    -- Tope del ramo: comisión efectiva (máxima) + bonos + gastos <= ppormax
    IF @iestado = 'V'
    BEGIN
        DECLARE @pcom NUMERIC(19, 2), @pbon NUMERIC(19, 2), @pgas NUMERIC(19, 2), @pmax NUMERIC(19, 2), @error VARCHAR(300);
        EXEC dbo.spComisionTopeProductor @cramo, @cproductor, @fdesde, @fhasta,
             @pcom OUTPUT, @pbon OUTPUT, @pgas OUTPUT, @pmax OUTPUT;
        -- La comisión que cuenta es la mayor entre la general y la del productor; se recalcula sin la fila actual
        DECLARE @pcom_otros NUMERIC(19, 2) = (
            SELECT COALESCE(MAX(pcomision), 0) FROM maarancel
             WHERE cramo = @cramo AND (cproductor = @cproductor OR cproductor = 0)
               AND ISNULL(iestado, 'V') <> 'N'
               AND CONVERT(DATE, fdesde) <= @fdesde AND CONVERT(DATE, fhasta) >= @fhasta
               AND NOT (cproductor = @cproductor AND cplan = @cplan AND ctipoprod = @ctipoprod
                        AND ccober = @ccober AND CONVERT(DATE, fdesde) = @fdesde));
        IF @pmax IS NOT NULL
           AND (CASE WHEN @pcomision > @pcom_otros THEN @pcomision ELSE @pcom_otros END) + @pbon + @pgas > @pmax
        BEGIN
            SET @error = CONCAT('SUPERA EL MAXIMO DEL RAMO: ', @pmax, '% (BONOS ', @pbon, '% + GASTOS ', @pgas,
                                '%). COMISION MAXIMA PERMITIDA: ', @pmax - @pbon - @pgas, '%');
            THROW 99001, @error, 1;
        END
    END

    DECLARE @ppormax NUMERIC(19, 2) = (SELECT TOP (1) ppormax FROM maarancel
                                     WHERE cramo = @cramo AND cproductor = 0 AND ppormax IS NOT NULL
                                     ORDER BY CASE WHEN ISNULL(iestado, 'V') <> 'N' THEN 0 ELSE 1 END, fdesde DESC);

    IF EXISTS (SELECT 1 FROM maarancel
                WHERE cplan = @cplan AND cramo = @cramo AND ctipoprod = @ctipoprod AND cproductor = @cproductor
                  AND ccober = @ccober AND ctarifa = '0' AND CONVERT(DATE, fdesde) = @fdesde)
    BEGIN
        UPDATE maarancel
           SET fhasta = @fhasta, pcomision = @pcomision, iestado = @iestado,
               cprog = @cprog, cusuariomod = @cusuario, fultmod = GETDATE()
         WHERE cplan = @cplan AND cramo = @cramo AND ctipoprod = @ctipoprod AND cproductor = @cproductor
           AND ccober = @ccober AND ctarifa = '0' AND CONVERT(DATE, fdesde) = @fdesde;
    END
    ELSE
    BEGIN
        INSERT INTO maarancel (cplan, cramo, ctipoprod, cproductor, ccober, ctarifa, fdesde, u_version, fhasta,
                               pcomision, ppormax, iestado, cprog, ifuente, fingreso, cusuario)
        VALUES (@cplan, @cramo, @ctipoprod, @cproductor, @ccober, '0', @fdesde, '-', @fhasta,
                @pcomision, @ppormax, @iestado, @cprog, 'SpComProd', GETDATE(), @cusuario);
    END

    SELECT @cproductor AS cproductor, @cramo AS cramo, @cplan AS cplan, @fdesde AS fdesde, @pcomision AS pcomision, @iestado AS iestado;
END
GO

------------------------------------------------------------------------------
-- Bono de un productor por ramo (y opcionalmente plan) en mabonos.
-- @cbono NULL = bono nuevo (correlativo por productor + ramo); con valor = actualiza ese bono.
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[spActCreBonoProductor]
    @cbono INT = NULL,
    @cplan CHAR(6) = '0',
    @cramo INT,
    @ctipoprod INT = 0,
    @cproductor NUMERIC(11, 0),
    @ccober CHAR(4) = '0',
    @iformcal CHAR(1) = '1',
    @xbono VARCHAR(60),
    @fdesde DATE,
    @fhasta DATE = NULL,
    @pbono NUMERIC(9, 2),
    @iestado CHAR(1) = 'V',
    @cusuario NUMERIC(11, 0) = NULL,
    @cprog CHAR(20) = 'nest-api'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SELECT @cplan = ISNULL(NULLIF(LTRIM(RTRIM(@cplan)), ''), '0'),
           @ccober = ISNULL(NULLIF(LTRIM(RTRIM(@ccober)), ''), '0'),
           @ctipoprod = ISNULL(@ctipoprod, 0),
           @iformcal = ISNULL(NULLIF(@iformcal, ''), '1'),
           @iestado = ISNULL(@iestado, 'V'),
           @xbono = UPPER(NULLIF(LTRIM(RTRIM(@xbono)), ''));
    IF @fhasta IS NULL OR @fhasta <= @fdesde SET @fhasta = DATEADD(YEAR, 20, @fdesde);

    IF ISNULL(@cproductor, 0) = 0
        THROW 99001, 'INDIQUE EL PRODUCTOR (LOS BONOS GENERALES NO SE MODIFICAN DESDE AQUI)', 1;
    IF NOT EXISTS (SELECT 1 FROM maproduc WHERE cproductor = @cproductor)
        THROW 99001, 'EL PRODUCTOR NO EXISTE', 1;
    IF NOT EXISTS (SELECT 1 FROM maramos WHERE cramo = @cramo)
        THROW 99001, 'EL RAMO NO EXISTE', 1;
    IF @xbono IS NULL
        THROW 99001, 'INDIQUE LA DESCRIPCION DEL BONO', 1;
    IF @pbono IS NULL OR @pbono <= 0 OR @pbono > 100
        THROW 99001, 'EL PORCENTAJE DEL BONO DEBE ESTAR ENTRE 0 Y 100', 1;
    IF @iestado NOT IN ('V', 'N')
        THROW 99001, 'ESTADO INVALIDO (V o N)', 1;
    IF @cbono IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mabonos WHERE cbono = @cbono AND cramo = @cramo AND cproductor = @cproductor)
        THROW 99001, 'EL BONO INDICADO NO EXISTE PARA ESE PRODUCTOR Y RAMO', 1;

    -- Tope del ramo: comisión + bonos (sin este bono) + gastos + nuevo bono <= ppormax
    IF @iestado = 'V'
    BEGIN
        DECLARE @pcom NUMERIC(19, 2), @pbon NUMERIC(19, 2), @pgas NUMERIC(19, 2), @pmax NUMERIC(19, 2), @error VARCHAR(300);
        EXEC dbo.spComisionTopeProductor @cramo, @cproductor, @fdesde, @fhasta,
             @pcom OUTPUT, @pbon OUTPUT, @pgas OUTPUT, @pmax OUTPUT;
        DECLARE @pbono_actual NUMERIC(19, 2) = 0;
        IF @cbono IS NOT NULL
            SELECT @pbono_actual = COALESCE(SUM(pbono), 0) FROM mabonos
             WHERE cbono = @cbono AND cramo = @cramo AND cproductor = @cproductor AND ISNULL(iestado, 'V') <> 'N'
               AND CONVERT(DATE, fdesde) <= @fdesde AND CONVERT(DATE, fhasta) >= @fhasta;
        IF @pmax IS NOT NULL AND @pcom + (@pbon - @pbono_actual) + @pgas + @pbono > @pmax
        BEGIN
            SET @error = CONCAT('SUPERA EL MAXIMO DEL RAMO: ', @pmax, '% (COMISION ', @pcom, '% + BONOS ', @pbon - @pbono_actual,
                                '% + GASTOS ', @pgas, '%). BONO MAXIMO PERMITIDO: ', @pmax - @pcom - (@pbon - @pbono_actual) - @pgas, '%');
            THROW 99001, @error, 1;
        END
    END

    BEGIN TRAN;

    IF @cbono IS NULL
    BEGIN
        SELECT @cbono = ISNULL(MAX(cbono), 0) + 1 FROM mabonos WITH (UPDLOCK, HOLDLOCK)
         WHERE cramo = @cramo AND cproductor = @cproductor;

        INSERT INTO mabonos (cplan, cramo, ctipoprod, cproductor, ccober, ctarifa, iformcal, cbono, fdesde,
                             u_version, xbono, fhasta, qdias, pbono, iestado, cprog, ifuente, fingreso, cusuario)
        VALUES (@cplan, @cramo, @ctipoprod, @cproductor, @ccober, '0', @iformcal, @cbono, @fdesde,
                '-', @xbono, @fhasta, 1, @pbono, @iestado, @cprog, 'SpBonoProd', GETDATE(), @cusuario);
    END
    ELSE
    BEGIN
        UPDATE mabonos
           SET cplan = @cplan, ctipoprod = @ctipoprod, ccober = @ccober, iformcal = @iformcal,
               xbono = @xbono, fdesde = @fdesde, fhasta = @fhasta, pbono = @pbono, iestado = @iestado,
               cprog = @cprog, cusuariomod = @cusuario, fultmod = GETDATE()
         WHERE cbono = @cbono AND cramo = @cramo AND cproductor = @cproductor;
    END

    COMMIT;

    SELECT @cproductor AS cproductor, @cramo AS cramo, @cbono AS cbono, @pbono AS pbono, @iestado AS iestado;
END
GO

/* Verificación (después de ejecutar): deben salir los 3 SPs con la fecha de hoy.
SELECT name, modify_date FROM sys.procedures
WHERE name IN ('spComisionTopeProductor', 'spActCreComisionProductor', 'spActCreBonoProductor')
ORDER BY name;
*/
