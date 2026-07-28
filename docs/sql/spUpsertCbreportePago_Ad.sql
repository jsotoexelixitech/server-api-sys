/* ================================================================
   STORED PROCEDURE: spUpsertCbreportePago_Ad
   Base de datos   : Sis2000 (PROD y QA)
   Autor           : Exélixi Tech
   Fecha           : 2026-07-14
   Versión         : 1.0

   PROPÓSITO
   ---------
   Encapsula el UPSERT en cbreporte_pago que actualmente realiza
   nest-api mediante SQL dinámico directo.

   Alinea el flujo de cobro externo (Exélixi RCV) con el patrón
   de SPs ya usado por SysIP (spCobroSis_Ad, spNotificaPago, etc.).

   PORTABILIDAD QA / PROD
   ----------------------
   Las columnas ctipopago y freporte se detectan en tiempo de
   ejecución con COL_LENGTH. Si no existen (QA) se omiten
   silenciosamente sin error.

   PARÁMETROS OUTPUT
   -----------------
   @accion  CHAR(1)
       'I' = fila insertada
       'U' = fila actualizada
       'E' = error (se lanza RAISERROR)
   @mensaje VARCHAR(500)
       'OK' o descripción del error

   TABLA AFECTADA
   --------------
   dbo.cbreporte_pago

   FLUJO
   -----
   1. UPDATE WHERE ctransaccion + npago
   2. Si @@ROWCOUNT = 0  → INSERT
   3. Si INSERT falla por duplicate key (race condition) → retry UPDATE
   4. Cualquier otro error → RAISERROR

   USO DESDE nest-api (collection.service.ts)
   -------------------------------------------
   Reemplaza insertSoporteRows() + getCbreporteColumns().
   Ver sección "Adaptación en Node.js" al final del archivo.
================================================================ */

-- ── Crear el SP ───────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE dbo.spUpsertCbreportePago_Ad
    @ctransaccion   NUMERIC(18, 0),
    @npago          NUMERIC(18, 0),
    @casegurado     NUMERIC(18, 0),
    @cmoneda        CHAR(4),
    @cbanco         NUMERIC(18, 2)  = NULL,
    @cbanco_destino NUMERIC(18, 2)  = NULL,
    @ctipopago      NUMERIC(10, 0)  = NULL,
    @mpago          NUMERIC(18, 2),
    @mpagoext       NUMERIC(18, 2),
    @mpagoigtf      NUMERIC(18, 2)  = 0,
    @mpagoigtfext   NUMERIC(18, 2)  = 0,
    @mtotal         NUMERIC(18, 2),
    @mtotalext      NUMERIC(18, 2),
    @ptasamon       NUMERIC(18, 4)  = 1,
    @ptasaref       NUMERIC(18, 4)  = 1,
    @xreferencia    VARCHAR(30)     = NULL,
    @xruta          VARCHAR(100)    = 'Sin soporte',
    @cusuario       NUMERIC(18, 0),
    @fingreso       DATETIME        = NULL,
    @freporte       DATETIME        = NULL,
    @cprog          CHAR(20)        = 'spUpsertCbrPago',
    @accion         CHAR(1)         = NULL OUTPUT,
    @mensaje        VARCHAR(500)    = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @accion  = '';
    SET @mensaje = 'OK';

    IF @fingreso IS NULL SET @fingreso = GETDATE();
    IF @freporte IS NULL SET @freporte = @fingreso;

    /* ── Detectar columnas opcionales (portabilidad QA / PROD) ───── */
    DECLARE @tieneCTipoPago BIT = 0,
            @tieneFreporte  BIT = 0;

    IF COL_LENGTH('dbo.cbreporte_pago', 'ctipopago') IS NOT NULL SET @tieneCTipoPago = 1;
    IF COL_LENGTH('dbo.cbreporte_pago', 'freporte')  IS NOT NULL SET @tieneFreporte  = 1;

    DECLARE @setExtra NVARCHAR(200) = N'',
            @colExtra NVARCHAR(200) = N'',
            @valExtra NVARCHAR(200) = N'';

    IF @tieneCTipoPago = 1 BEGIN
        SET @setExtra += N', ctipopago = @ctipopago';
        SET @colExtra += N', ctipopago';
        SET @valExtra += N', @ctipopago';
    END
    IF @tieneFreporte = 1 BEGIN
        SET @setExtra += N', freporte = @freporte';
        SET @colExtra += N', freporte';
        SET @valExtra += N', @freporte';
    END

    /* ── Declaración de parámetros para sp_executesql ─────────────── */
    DECLARE @params NVARCHAR(MAX) = N'
        @ctransaccion   NUMERIC(18,0),  @npago          NUMERIC(18,0),
        @casegurado     NUMERIC(18,0),  @cmoneda        CHAR(4),
        @cbanco         NUMERIC(18,2),  @cbanco_destino NUMERIC(18,2),
        @ctipopago      NUMERIC(10,0),
        @mpago          NUMERIC(18,2),  @mpagoext       NUMERIC(18,2),
        @mpagoigtf      NUMERIC(18,2),  @mpagoigtfext   NUMERIC(18,2),
        @mtotal         NUMERIC(18,2),  @mtotalext      NUMERIC(18,2),
        @ptasamon       NUMERIC(18,4),  @ptasaref       NUMERIC(18,4),
        @xreferencia    VARCHAR(30),    @xruta          VARCHAR(100),
        @cusuario       NUMERIC(18,0),  @fingreso       DATETIME,
        @freporte       DATETIME,       @cprog          CHAR(20)';

    DECLARE @sql NVARCHAR(MAX);

    BEGIN TRY

        /* ── 1. Intentar UPDATE ──────────────────────────────────── */
        SET @sql = N'
            UPDATE dbo.cbreporte_pago SET
                casegurado     = @casegurado,
                cmoneda        = @cmoneda,
                cbanco         = @cbanco,
                cbanco_destino = @cbanco_destino,
                mpago          = @mpago,
                mpagoext       = @mpagoext,
                mpagoigtf      = @mpagoigtf,
                mpagoigtfext   = @mpagoigtfext,
                mtotal         = @mtotal,
                mtotalext      = @mtotalext,
                ptasamon       = @ptasamon,
                ptasaref       = @ptasaref,
                xreferencia    = @xreferencia,
                xruta          = @xruta,
                cusuario       = @cusuario,
                fingreso       = @fingreso,
                cprog          = @cprog'
            + @setExtra
            + N'
            WHERE ctransaccion = @ctransaccion
              AND npago         = @npago';

        EXEC sp_executesql @sql, @params,
            @ctransaccion, @npago, @casegurado, @cmoneda,
            @cbanco, @cbanco_destino, @ctipopago,
            @mpago, @mpagoext, @mpagoigtf, @mpagoigtfext,
            @mtotal, @mtotalext, @ptasamon, @ptasaref,
            @xreferencia, @xruta, @cusuario, @fingreso, @freporte, @cprog;

        IF @@ROWCOUNT > 0
        BEGIN
            SET @accion = 'U';
            RETURN;
        END

        /* ── 2. INSERT si no existía la fila ─────────────────────── */
        SET @sql = N'
            INSERT INTO dbo.cbreporte_pago (
                ctransaccion, npago, casegurado, cmoneda,
                cbanco, cbanco_destino,
                mpago, mpagoext, mpagoigtf, mpagoigtfext,
                mtotal, mtotalext, ptasamon, ptasaref,
                xreferencia, xruta, cusuario, fingreso, cprog'
            + @colExtra
            + N'
            ) VALUES (
                @ctransaccion, @npago, @casegurado, @cmoneda,
                @cbanco, @cbanco_destino,
                @mpago, @mpagoext, @mpagoigtf, @mpagoigtfext,
                @mtotal, @mtotalext, @ptasamon, @ptasaref,
                @xreferencia, @xruta, @cusuario, @fingreso, @cprog'
            + @valExtra
            + N')';

        EXEC sp_executesql @sql, @params,
            @ctransaccion, @npago, @casegurado, @cmoneda,
            @cbanco, @cbanco_destino, @ctipopago,
            @mpago, @mpagoext, @mpagoigtf, @mpagoigtfext,
            @mtotal, @mtotalext, @ptasamon, @ptasaref,
            @xreferencia, @xruta, @cusuario, @fingreso, @freporte, @cprog;

        SET @accion = 'I';

    END TRY
    BEGIN CATCH

        /* Duplicate key por race condition → retry UPDATE ────────── */
        IF ERROR_NUMBER() IN (2601, 2627)
        BEGIN
            SET @sql = N'
                UPDATE dbo.cbreporte_pago SET
                    cbanco_destino = @cbanco_destino,
                    cusuario       = @cusuario,
                    fingreso       = @fingreso,
                    cprog          = @cprog'
                + @setExtra
                + N'
                WHERE ctransaccion = @ctransaccion
                  AND npago         = @npago';

            EXEC sp_executesql @sql, @params,
                @ctransaccion, @npago, @casegurado, @cmoneda,
                @cbanco, @cbanco_destino, @ctipopago,
                @mpago, @mpagoext, @mpagoigtf, @mpagoigtfext,
                @mtotal, @mtotalext, @ptasamon, @ptasaref,
                @xreferencia, @xruta, @cusuario, @fingreso, @freporte, @cprog;

            SET @accion = 'U';
            RETURN;
        END

        /* Cualquier otro error ───────────────────────────────────── */
        SET @accion  = 'E';
        SET @mensaje = 'Error ' + CAST(ERROR_NUMBER() AS VARCHAR) + ': ' + ERROR_MESSAGE();
        RAISERROR(@mensaje, 16, 1);

    END CATCH
END;
GO


/* ================================================================
   SCRIPT DE PRUEBA
   Ejecutar en SSMS contra la BD de destino (QA o PROD).
   Ajustar @ctransaccion con un ingreso real para verificar.
================================================================ */

DECLARE @accion  CHAR(1),
        @mensaje VARCHAR(500);

EXEC dbo.spUpsertCbreportePago_Ad
    @ctransaccion   = 183034,       -- usar número de ingreso real
    @npago          = 1,
    @casegurado     = 1,
    @cmoneda        = 'Bs  ',
    @cbanco         = 102,          -- banco origen (pago móvil BNC = 102)
    @cbanco_destino = 35,           -- 35 = pago móvil destino, 31 = sypago
    @ctipopago      = 3,            -- 3 = pago móvil (LAMUNDIAL_CTIPOPAGO)
    @mpago          = 7.24,
    @mpagoext       = 0.01,
    @mpagoigtf      = 0,
    @mpagoigtfext   = 0,
    @mtotal         = 7.24,
    @mtotalext      = 0.01,
    @ptasamon       = 1,
    @ptasaref       = 1,
    @xreferencia    = '183034',
    @xruta          = 'Sin soporte',
    @cusuario       = 4,
    @fingreso       = GETDATE(),
    @freporte       = GETDATE(),
    @cprog          = 'TEST_EXELIXI',
    @accion         = @accion  OUTPUT,
    @mensaje        = @mensaje OUTPUT;

SELECT
    @accion  AS accion,     -- esperado: 'I' o 'U'
    @mensaje AS mensaje;    -- esperado: 'OK'

-- Verificar campos críticos para ingreso_caja
SELECT
    ctransaccion,
    npago,
    cbanco_destino,
    ctipopago,
    freporte,
    fingreso,
    xreferencia,
    cusuario
FROM dbo.cbreporte_pago
WHERE ctransaccion = 183034;

GO


/* ================================================================
   REFERENCIA DE VALORES — cbanco_destino / ctipopago

   cbanco_destino  (tabla MABANCO_DESTINO)
   ----------------------------------------
   31 → Sypago
   35 → Pago Móvil

   ctipopago  (tabla MABANCO_DESTINO o catálogo)
   -----------------------------------------------
   3  → Pago Móvil  (valor por defecto PROD — env LAMUNDIAL_CTIPOPAGO)

   cusuario (cajero que aparece en PDF recibo)
   -------------------------------------------
   4   → usuario por defecto de la API
   7   → usuario SysIP main (valor que usa el sistema principal)

================================================================ */


/* ================================================================
   ADAPTACIÓN EN nest-api  (collection.service.ts)
   ------------------------------------------------
   Una vez instalado el SP, reemplazar insertSoporteRows() y
   getCbreporteColumns() por esta llamada simple:

   private async upsertSoporteRow(
     ctransaccion: number,
     s: SoporteRow,
     npago: number,
     cusuario: number,
     cprog: string,
     fingresoOperacion: Date,
   ): Promise<void> {
     const T    = this.db.types;
     const req  = this.db.request();

     req.input ('ctransaccion',   T.Numeric(18,0), ctransaccion);
     req.input ('npago',          T.Numeric(18,0), npago);
     req.input ('casegurado',     T.Numeric(18,0), 1);
     req.input ('cmoneda',        T.Char(4),        s.cmoneda);
     req.input ('cbanco',         T.Numeric(18,2), s.cbanco         ?? null);
     req.input ('cbanco_destino', T.Numeric(18,2), s.cbanco_destino ?? null);
     req.input ('ctipopago',      T.Numeric(10,0), s.ctipopago      ?? null);
     req.input ('mpago',          T.Numeric(18,2), s.mpago);
     req.input ('mpagoext',       T.Numeric(18,2), s.mpagoext);
     req.input ('mpagoigtf',      T.Numeric(18,2), s.mpagoigtf      ?? 0);
     req.input ('mpagoigtfext',   T.Numeric(18,2), s.mpagoigtfext   ?? 0);
     req.input ('mtotal',         T.Numeric(18,2), s.mpago);
     req.input ('mtotalext',      T.Numeric(18,2), s.mpagoext);
     req.input ('ptasamon',       T.Numeric(18,4), 1);
     req.input ('ptasaref',       T.Numeric(18,4), 1);
     req.input ('xreferencia',    T.VarChar(30),   s.xreferencia    ?? null);
     req.input ('xruta',          T.VarChar(100),  s.xruta          ?? 'Sin soporte');
     req.input ('cusuario',       T.Numeric(18,0), cusuario);
     req.input ('fingreso',       T.DateTime,       fingresoOperacion);
     req.input ('freporte',       T.DateTime,       fingresoOperacion);
     req.input ('cprog',          T.Char(20),       cprog);
     req.output('accion',         T.Char(1));
     req.output('mensaje',        T.VarChar(500));

     const result = await req.execute('spUpsertCbreportePago_Ad');

     if (result.output['accion'] === 'E') {
       throw new BadRequestException(
         `spUpsertCbreportePago_Ad: ${result.output['mensaje']}`,
       );
     }

     this.logger.log(
       `upsertSoporte [${result.output['accion']}] ctransaccion=${ctransaccion} ` +
       `npago=${npago} destino=${s.cbanco_destino} tipo=${s.ctipopago}`,
     );
   }
================================================================ */
