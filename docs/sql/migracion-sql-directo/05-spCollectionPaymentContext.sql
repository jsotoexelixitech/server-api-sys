/*
  nest-api — reemplaza SQL directo en producción
  ─────────────────────────────────────────────
  collection.service.ts
    isPaymentRegistered    → RS3 (found)
    getReceiptAmounts      → RS0 (adrecibos)
    getPagoMovilOperacion  → RS1 (pago_movil)
    resolvePaymentBanks    → RS2 (destino 31/35)
    resolveCbancoFromRef   → RS4 (mabanco)

  SQL reemplazado:
    EXISTS pago_movil/trsypago por referencia
    SELECT ... FROM adrecibos WHERE cnrecibo=...
    SELECT ... FROM pago_movil WHERE referencia_banco LIKE ...
    CASE WHEN EXISTS trsypago THEN 31 WHEN pago_movil THEN 35 END
    SELECT TOP 1 cbanco FROM mabanco WHERE cbanco_ref=...
*/

CREATE OR ALTER PROCEDURE [dbo].[spCollectionPaymentContext]
    @xreferencia VARCHAR(30),
    @cnrecibo    VARCHAR(30),
    @cbanco_ref  VARCHAR(10) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- RS0: recibo
    SELECT
        ctenedor,
        TRIM(cmoneda) AS cmoneda,
        mprimabrutaext,
        mmontorecext,
        mmontorec,
        ptasamon
    FROM adrecibos
    WHERE cnrecibo = @cnrecibo;

    -- RS1: pago móvil
    SELECT TOP 1 banco_origen, banco_destino, fecha_movimiento
    FROM pago_movil
    WHERE referencia_banco LIKE '%' + @xreferencia + '%'
    ORDER BY fcreacion DESC;

    -- RS2: destino hint
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM trsypago WHERE ref_ibp LIKE '%' + @xreferencia + '%') THEN 31
        WHEN EXISTS (SELECT 1 FROM pago_movil WHERE referencia_banco LIKE '%' + @xreferencia + '%') THEN 35
        ELSE NULL
    END AS cbanco_destino;

    -- RS3: registrado
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM pago_movil WHERE referencia_banco LIKE '%' + @xreferencia + '%') THEN 1
        WHEN EXISTS (SELECT 1 FROM trsypago WHERE ref_ibp LIKE '%' + @xreferencia + '%') THEN 1
        ELSE 0
    END AS found;

    -- RS4: cbanco desde ref (prueba ref, 4 dígitos y sin ceros)
    IF @cbanco_ref IS NOT NULL AND LTRIM(RTRIM(@cbanco_ref)) <> ''
    BEGIN
        DECLARE @ref VARCHAR(10) = LTRIM(RTRIM(@cbanco_ref));
        DECLARE @ref4 VARCHAR(10) = CASE WHEN @ref LIKE '%[^0-9]%' THEN @ref ELSE RIGHT('0000' + @ref, 4) END;
        DECLARE @refStrip VARCHAR(10) = CASE WHEN @ref LIKE '%[^0-9]%' THEN @ref ELSE LTRIM(STR(CAST(@ref AS INT))) END;

        SELECT TOP 1 cbanco
        FROM mabanco
        WHERE LTRIM(RTRIM(cbanco_ref)) IN (@ref, @ref4, @refStrip)
           OR CAST(cbanco AS VARCHAR(20)) IN (@ref, @ref4, @refStrip);
    END
    ELSE
        SELECT CAST(NULL AS INT) AS cbanco WHERE 1 = 0;
END;
