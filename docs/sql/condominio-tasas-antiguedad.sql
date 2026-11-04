-- Condominio (ramo 16): tasa global por antigüedad de construcción y uso del edificio, y su reparto por cobertura.
-- Fuente: "Suma Asegurada- Tasas y Deducibles. Tu Condominio V6 14052026 Tasas V5+ Terremoto.xlsx", hoja Tasas y Deducibles.
--
-- La tasa global incluye terremoto. Reparto de la tasa global entre las coberturas:
--   itipo 'F' = parte fija de la tasa (terremoto 0,12), no depende de la antigüedad.
--   itipo 'P' = porcentaje de lo que queda tras restar las partes fijas (Básica y RC; deben sumar 100).
-- Los porcentajes 'P' los configura Técnica en el panel: hasta entonces Condominio no cotiza con esta tarifa.
--
-- Tasas en porcentaje, igual que matarifa_d.pprima (0,25125 = 0,25125 %).
-- Tramos (itramo): 1 = 1967 o antes · 2 = 1968-1993 · 3 = 1994-2018 · 4 = 2019 en adelante.
-- Uso (iuso): R = Residencial · C = Comercial, oficinas y centros comerciales.
-- Idempotente: se puede ejecutar más de una vez y no pisa lo que Técnica ya haya cambiado.

SET NOCOUNT ON;

IF OBJECT_ID('dbo.MATARIFA_ANTIGUEDAD_NEXUS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MATARIFA_ANTIGUEDAD_NEXUS (
        cramo       SMALLINT      NOT NULL,
        iuso        CHAR(1)       NOT NULL,
        itramo      TINYINT       NOT NULL,
        pprima      NUMERIC(9, 6) NOT NULL,
        fultmod     DATETIME      NULL,
        cusuariomod NUMERIC(18, 0) NULL,
        CONSTRAINT PK_MATARIFA_ANTIGUEDAD_NEXUS PRIMARY KEY (cramo, iuso, itramo),
        CONSTRAINT CK_MATARIFA_ANTIGUEDAD_NEXUS_USO CHECK (iuso IN ('R', 'C')),
        CONSTRAINT CK_MATARIFA_ANTIGUEDAD_NEXUS_TRAMO CHECK (itramo BETWEEN 1 AND 4)
    );
END;

IF OBJECT_ID('dbo.MATARIFA_REPARTO_NEXUS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MATARIFA_REPARTO_NEXUS (
        cramo       SMALLINT      NOT NULL,
        ccober      VARCHAR(4)    NOT NULL,
        ctarifa     VARCHAR(4)    NOT NULL,
        itipo       CHAR(1)       NOT NULL,
        pvalor      NUMERIC(9, 6) NOT NULL,
        fultmod     DATETIME      NULL,
        cusuariomod NUMERIC(18, 0) NULL,
        CONSTRAINT PK_MATARIFA_REPARTO_NEXUS PRIMARY KEY (cramo, ccober, ctarifa),
        CONSTRAINT CK_MATARIFA_REPARTO_NEXUS_TIPO CHECK (itipo IN ('F', 'P'))
    );
END;

;WITH excel AS (
    SELECT * FROM (VALUES
        ('R', 1, 0.25125), ('R', 2, 0.2325), ('R', 3, 0.21375), ('R', 4, 0.195),
        ('C', 1, 0.2775),  ('C', 2, 0.255),  ('C', 3, 0.2325),  ('C', 4, 0.21)
    ) t (iuso, itramo, pprima)
)
INSERT INTO dbo.MATARIFA_ANTIGUEDAD_NEXUS (cramo, iuso, itramo, pprima, fultmod)
SELECT 16, e.iuso, e.itramo, e.pprima, GETDATE()
FROM excel e
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MATARIFA_ANTIGUEDAD_NEXUS a
    WHERE a.cramo = 16 AND a.iuso = e.iuso AND a.itramo = e.itramo
);

-- Terremoto: 0,12 fijo, con la tarifa vigente de la cobertura 2 en matarifa_d.
INSERT INTO dbo.MATARIFA_REPARTO_NEXUS (cramo, ccober, ctarifa, itipo, pvalor, fultmod)
SELECT TOP 1 16, RTRIM(d.ccober), RTRIM(d.ctarifa), 'F', 0.12, GETDATE()
FROM dbo.matarifa_d d
WHERE d.cramo = 16
  AND RTRIM(d.ccober) = '2'
  AND d.iestado = 'V'
  AND d.fdesde <= GETDATE()
  AND (d.fhasta IS NULL OR d.fhasta >= GETDATE())
  AND NOT EXISTS (SELECT 1 FROM dbo.MATARIFA_REPARTO_NEXUS r WHERE r.cramo = 16 AND r.itipo = 'F');

SELECT 'tasas' AS tabla, iuso, itramo, pprima FROM dbo.MATARIFA_ANTIGUEDAD_NEXUS WHERE cramo = 16 ORDER BY iuso DESC, itramo;
SELECT 'reparto' AS tabla, ccober, ctarifa, itipo, pvalor FROM dbo.MATARIFA_REPARTO_NEXUS WHERE cramo = 16;
