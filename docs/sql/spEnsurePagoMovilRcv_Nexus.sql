/* ================================================================
   STORED PROCEDURE: spEnsurePagoMovilRcv_Nexus
   Base de datos   : Sis2000 (QA sis2000_qa / PROD)
   Autor           : Exélixi Tech
   Fecha           : 2026-09-23

   PROPÓSITO
   ---------
   Idempotente: inserta en dbo.pago_movil si no existe referencia_banco,
   antes de spCobroSis_Ad (flujo cobro RCV / tarjeta Exélixi).

   Casos:
   - Pago móvil verificado (ifuente EXELIXI)
   - Tarjeta RCV farmacia bfactura=1 (xreferencia = nfactura, ifuente FARMRCV)

   pago_movil.ifuente es CHAR(10): el SP trunca/valida @ifuente a 10 chars
   y falla con mensaje claro si el valor original supera 10 (evita error 2628).

   OUTPUT @accion
   --------------
   I = insertado
   S = ya existía (skip)
   E = error (RAISERROR con @mensaje)

   DEPLOY
   ------
   Ejecutar en sis2000_qa y Sis2000 prod (misma BD que usa nest-api MssqlService).

   USO nest-api
   ------------
   collection.service.ts → ensurePagoMovilRegisteredViaSp()
================================================================ */

CREATE OR ALTER PROCEDURE dbo.spEnsurePagoMovilRcv_Nexus
    @xreferencia   VARCHAR(50),
    @dni           VARCHAR(20)     = NULL,
    @tel_orig      VARCHAR(20)     = NULL,
    @tel_dest      VARCHAR(20)     = NULL,
    @banco_orig    VARCHAR(10)     = NULL,
    @banco_dest    VARCHAR(10)     = NULL,
    @monto         NUMERIC(18, 2)  = NULL,
    @fecha         DATETIME        = NULL,
    @descripcion   VARCHAR(200)    = NULL,
    @ifuente       VARCHAR(20)     = NULL,
    @accion        CHAR(1)         = NULL OUTPUT,
    @mensaje       VARCHAR(500)    = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @accion  = 'E';
    SET @mensaje = '';

    DECLARE @ifuente10 CHAR(10);
    DECLARE @ifuenteRaw VARCHAR(20) = LTRIM(RTRIM(ISNULL(@ifuente, 'EXELIXI')));

    IF @xreferencia IS NULL OR LTRIM(RTRIM(@xreferencia)) = ''
    BEGIN
        SET @mensaje = 'xreferencia requerida.';
        RAISERROR(@mensaje, 16, 1);
        RETURN;
    END

    IF LEN(@ifuenteRaw) > 10
    BEGIN
        SET @mensaje = 'ifuente excede 10 caracteres (pago_movil.ifuente CHAR(10)): ' + @ifuenteRaw;
        RAISERROR(@mensaje, 16, 1);
        RETURN;
    END

    SET @ifuente10 = CAST(@ifuenteRaw AS CHAR(10));

    IF @descripcion IS NULL OR LTRIM(RTRIM(@descripcion)) = ''
        SET @descripcion = 'Pago RCV Exélixi';

    IF @fecha IS NULL
        SET @fecha = GETDATE();

    IF EXISTS (SELECT 1 FROM dbo.pago_movil WHERE referencia_banco = @xreferencia)
    BEGIN
        SET @accion  = 'S';
        SET @mensaje = 'Referencia ya registrada en pago_movil.';
        RETURN;
    END

    BEGIN TRY
        INSERT INTO dbo.pago_movil
            (dni, telefono_origen, telefono_destino, banco_origen, banco_destino,
             referencia_banco, monto, fecha_movimiento, descripcion, refpk, ifuente, fcreacion)
        VALUES
            (@dni, @tel_orig, @tel_dest, @banco_orig, @banco_dest,
             @xreferencia, @monto, @fecha, @descripcion, @xreferencia, @ifuente10, GETDATE());

        SET @accion  = 'I';
        SET @mensaje = 'OK';
    END TRY
    BEGIN CATCH
        SET @accion  = 'E';
        SET @mensaje = ERROR_MESSAGE();
        RAISERROR(@mensaje, 16, 1);
    END CATCH
END;
GO
