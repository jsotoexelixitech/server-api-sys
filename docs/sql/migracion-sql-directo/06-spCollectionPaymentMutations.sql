/*
  nest-api — reemplaza SQL directo en producción
  ─────────────────────────────────────────────
  collection.service.ts
    ensureMobilePaymentRegistered → @accion=ENSURE_PAGO_MOVIL
    verifySoporteGuardado         → @accion=VERIFY_SOPORTE
    collectPayment                → @accion=UPDATE_TRAN

  SQL reemplazado:
    INSERT INTO pago_movil (...) WHERE NOT EXISTS (referencia)
    SELECT TOP 1 ... FROM cbreporte_pago WHERE ctransaccion=...
    UPDATE cbreporte_tran SET fingreso, mpagoext WHERE ctransaccion=...
*/

CREATE OR ALTER PROCEDURE [dbo].[spCollectionPaymentMutations]
    @accion        VARCHAR(20),
    @xreferencia   VARCHAR(50)     = NULL,
    @dni           VARCHAR(20)     = NULL,
    @tel_orig      VARCHAR(20)     = NULL,
    @tel_dest      VARCHAR(20)     = NULL,
    @banco_orig    VARCHAR(10)     = NULL,
    @banco_dest    VARCHAR(10)     = NULL,
    @monto         NUMERIC(18, 2)  = NULL,
    @fecha         DATETIME        = NULL,
    @ctransaccion  NUMERIC(18, 0)  = NULL,
    @fingreso      DATETIME        = NULL,
    @mpagoext      DECIMAL(19, 4)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @accion = 'ENSURE_PAGO_MOVIL'
    BEGIN
        IF EXISTS (SELECT 1 FROM pago_movil WHERE referencia_banco = @xreferencia)
            RETURN;

        INSERT INTO pago_movil
            (dni, telefono_origen, telefono_destino, banco_origen, banco_destino,
             referencia_banco, monto, fecha_movimiento, descripcion, refpk, ifuente, fcreacion)
        VALUES
            (@dni, @tel_orig, @tel_dest, @banco_orig, @banco_dest,
             @xreferencia, @monto, @fecha, 'Pago verificado API', @xreferencia, 'API', GETDATE());
        RETURN;
    END

    IF @accion = 'VERIFY_SOPORTE'
    BEGIN
        SELECT TOP 1 cbanco_destino, ctipopago, freporte, fingreso, xreferencia
        FROM cbreporte_pago
        WHERE ctransaccion = @ctransaccion;
        RETURN;
    END

    IF @accion = 'UPDATE_TRAN'
    BEGIN
        UPDATE cbreporte_tran
        SET fingreso = @fingreso, mpagoext = @mpagoext
        WHERE ctransaccion = @ctransaccion;
        RETURN;
    END

    THROW 99001, 'accion inválida en spCollectionPaymentMutations.', 1;
END;
