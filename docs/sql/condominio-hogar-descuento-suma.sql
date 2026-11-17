-- Condominio (ramo 16) y Hogar Blindado (ramo 38): descuento por rango de suma asegurada.
--
-- Técnica configura los tramos en el panel; el portal y el Core aplican el mismo % sobre la prima bruta de cada cobertura,
-- sumado al descuento por dispositivos de seguridad (madisseg). La emisión no cambia: el descuento ya viaja por cobertura
-- en la cotización preestablecida y sp_emision_condominio_nexus lo graba en adpoltar.mdescuento/mdescuentoext.
--
-- Un tramo cubre msuma_desde <= suma < msuma_hasta (msuma_hasta NULL = sin tope). Montos en US$, % sobre la prima bruta.
-- Sin filas para un ramo no hay descuento por suma.
-- Idempotente: solo crea la tabla si no existe; no carga tramos (los define Técnica).

SET NOCOUNT ON;

IF OBJECT_ID('dbo.MATARIFA_DESCUENTO_SUMA_NEXUS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MATARIFA_DESCUENTO_SUMA_NEXUS (
        cramo       SMALLINT       NOT NULL,
        msuma_desde NUMERIC(18, 2) NOT NULL,
        msuma_hasta NUMERIC(18, 2) NULL,
        pdescuento  NUMERIC(9, 4)  NOT NULL,
        fultmod     DATETIME       NULL,
        cusuariomod NUMERIC(18, 0) NULL,
        CONSTRAINT PK_MATARIFA_DESCUENTO_SUMA_NEXUS PRIMARY KEY (cramo, msuma_desde),
        CONSTRAINT CK_MATARIFA_DESCUENTO_SUMA_NEXUS_RAMO CHECK (cramo IN (16, 38)),
        CONSTRAINT CK_MATARIFA_DESCUENTO_SUMA_NEXUS_RANGO CHECK (msuma_desde >= 0 AND (msuma_hasta IS NULL OR msuma_hasta > msuma_desde)),
        CONSTRAINT CK_MATARIFA_DESCUENTO_SUMA_NEXUS_PCT CHECK (pdescuento >= 0 AND pdescuento < 100)
    );
END;

-- Verificación
SELECT cramo, msuma_desde, msuma_hasta, pdescuento, fultmod, cusuariomod
FROM dbo.MATARIFA_DESCUENTO_SUMA_NEXUS
ORDER BY cramo, msuma_desde;
