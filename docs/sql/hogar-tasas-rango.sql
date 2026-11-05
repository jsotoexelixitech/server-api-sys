-- Hogar (ramo 38): rango de tasa por cobertura para que suscriptores y productores elijan al cotizar.
--
-- matarifa_d.pprima sigue siendo la tasa vigente y guarda el promedio del rango: es la tasa del público.
-- Una cobertura sin fila aquí mantiene su tasa única y no muestra el slider.
-- Tasas en porcentaje, igual que matarifa_d.pprima (0,25 = 0,25 %).
-- Idempotente: se puede ejecutar más de una vez y no pisa lo que Técnica ya haya configurado.

SET NOCOUNT ON;

IF OBJECT_ID('dbo.MATARIFA_RANGO_NEXUS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MATARIFA_RANGO_NEXUS (
        cramo       SMALLINT       NOT NULL,
        ccober      CHAR(4)        NOT NULL,
        ctarifa     CHAR(4)        NOT NULL,
        ptasa_min   NUMERIC(9, 6)  NOT NULL,
        ptasa_max   NUMERIC(9, 6)  NOT NULL,
        fultmod     DATETIME       NULL,
        cusuariomod NUMERIC(18, 0) NULL,
        CONSTRAINT PK_MATARIFA_RANGO_NEXUS PRIMARY KEY (cramo, ccober, ctarifa),
        CONSTRAINT CK_MATARIFA_RANGO_NEXUS_ORDEN CHECK (ptasa_min >= 0 AND ptasa_min < ptasa_max AND ptasa_max <= 100)
    );
END;
