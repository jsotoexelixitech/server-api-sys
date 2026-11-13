/*
  Condominio (ramo 16): carga de tasas, reparto y deducibles del cotizador de Técnica (nov-2026).
  Rama: feat/condominio-reparto-opcional.

  REQUIERE, en este orden:
    1. condominio-tasas-antiguedad.sql      (tablas MATARIFA_ANTIGUEDAD_NEXUS y MATARIFA_REPARTO_NEXUS)
    2. condominio-reparto-opcional.sql      (iopcional, plimite, itipo M)
    3. Core con el PR #178 desplegado ANTES de que se cotice con esta carga (si no, la emisión rechaza la prima).

  Qué carga:
    a) Tasa global por uso y antigüedad = las del cotizador (las actuales son el 40 % de estas).
    b) Reparto: terremoto 0,12 fijo y opcional; el resto entre básica 20, robo 13, vidrios 4 (obligatorias)
       y motín 15, agua 12, inundación 12, electrónicos 12, maquinaria 12 (opcionales), con su límite en % de la suma.
       Daños al local: monto fijo USD 0,02 con límite 0,25 %. Extensión de cobertura: incluida, sin prima.
       Demolición (49), Honorarios (50), Salvamento (51) y Autoridad civil (52): monto fijo USD 0,02, límite 0,5 %.
       Gastos comunes extraordinarios (53): monto fijo USD 0,02, límite 5 %.
       Las 49-53 solo se cargan si el código existe con ese nombre (en QA .80 se crearon el 13-nov; en prod hay que crearlas).
    c) RC General (19) sale del reparto: opcional normal a 0,08 % sobre su límite (20 % de la suma, se configura en el panel).
    d) Deducibles en matarifa_d (pdedu_fran %, mdedu_franext mínimo US$) según el cotizador.

  DECISIONES A CONFIRMAR CON TÉCNICA (cambiar aquí si no aplican):
    - Robo, Asalto y/o Atraco del cotizador = cobertura 26 (ROBO). La 27 (ASALTO O ATRACO) queda fuera del reparto.
    - Terremoto (2 % de la suma) y Motín («según cláusula») no tienen deducible numérico: quedan en 0 y el texto
      sale de la plantilla del PDF.
    - Sin código en el Core todavía (no se cargan): Extinción de incendio, Suministros y equipos de mantenimiento,
      Asistencia domiciliaria.
    - Gastos comunes va en el 53, NO en el 48: en .80 y prod el 48 es DESLAVE y tiene pólizas.

  Seguridad: antes de tocar nada comprueba que cada código tenga el nombre esperado en ESTA base
  (en QA .67 y .80 los códigos 47 y 48 no significan lo mismo). Si alguno no coincide, aborta sin cambios.
  Todo va en una transacción. Se puede repetir: reemplaza tasas y reparto, y fija los deducibles.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH('dbo.MATARIFA_REPARTO_NEXUS', 'iopcional') IS NULL
BEGIN
    RAISERROR('Falta aplicar condominio-reparto-opcional.sql.', 16, 1);
    RETURN;
END;

-- ── Lo que se espera de cada código (patrón sobre macoberturas.xdescripcion_l) ──
DECLARE @esperado TABLE (ccober VARCHAR(4) PRIMARY KEY, patron VARCHAR(80), obligatorio BIT);
INSERT INTO @esperado VALUES
    ('1',  '%COMBINADO EMPRESARIAL%BASICA%', 1),
    ('2',  '%TERREMOTO%', 1),
    ('3',  '%MOTIN%', 1),
    ('4',  'DA%OS POR AGUA', 1),
    ('5',  'INUNDACION', 1),
    ('19', '%RESPONSABILIDAD CIVIL GENERAL%', 1),
    ('25', '%EXTENSION DE COBERTURA%', 1),
    ('26', 'ROBO', 1),
    ('28', '%LOCAL%ROBO%', 1),
    ('29', '%ROTURA DE VIDRIOS%', 1),
    ('30', '%EQUIPOS ELECTRONICOS%', 1),
    ('33', '%ROTURA DE MAQUINARIA%', 1),
    -- creadas en nov-2026: se cargan solo si existen con ese nombre
    ('49', '%DEMOLICION%', 0),
    ('50', '%HONORARIOS%', 0),
    ('51', 'SALVAMENTO', 0),
    ('52', 'AUTORIDAD CIVIL', 0),
    ('53', '%GASTOS COMUNES EXTRAORDINARIO%', 0);

-- FOR XML en vez de STRING_AGG: la base está en nivel de compatibilidad 130.
DECLARE @malos NVARCHAR(2000) = STUFF((
    SELECT CONCAT(', ', e.ccober, ' (', ISNULL(RTRIM(c.xdescripcion_l), 'no existe'), ')')
    FROM @esperado e
    LEFT JOIN macoberturas c ON c.cramo = 16 AND RTRIM(c.ccobertura) = e.ccober
    WHERE e.obligatorio = 1
      AND (c.ccobertura IS NULL OR RTRIM(c.xdescripcion_l) NOT LIKE e.patron COLLATE Modern_Spanish_CI_AI
           OR NOT EXISTS (SELECT 1 FROM matarifa_d d WHERE d.cramo = 16 AND RTRIM(d.ccober) = e.ccober AND d.iestado = 'V'))
    FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(2000)'), 1, 2, '');
IF @malos IS NOT NULL
BEGIN
    RAISERROR('Códigos que no coinciden o sin tarifa vigente en esta base: %s. No se cambió nada.', 16, 1, @malos);
    RETURN;
END;

-- Códigos que se omiten: los no obligatorios que en esta base no existen con su nombre o no tienen tarifa vigente.
DECLARE @omitir TABLE (ccober VARCHAR(4) PRIMARY KEY);
INSERT INTO @omitir
SELECT e.ccober FROM @esperado e
WHERE e.obligatorio = 0 AND NOT EXISTS (
    SELECT 1 FROM macoberturas c
    WHERE c.cramo = 16 AND RTRIM(c.ccobertura) = e.ccober
      AND RTRIM(c.xdescripcion_l) LIKE e.patron COLLATE Modern_Spanish_CI_AI
      AND EXISTS (SELECT 1 FROM matarifa_d d WHERE d.cramo = 16 AND RTRIM(d.ccober) = e.ccober AND d.iestado = 'V'));
IF EXISTS (SELECT 1 FROM @omitir)
BEGIN
    DECLARE @lista NVARCHAR(200) = STUFF((SELECT ', ' + ccober FROM @omitir FOR XML PATH('')), 1, 2, '');
    RAISERROR('Aviso: no existen en esta base y no se cargan: %s.', 10, 1, @lista);
END;

BEGIN TRANSACTION;

-- ── a) Tasa global por uso y tramo de antigüedad (%) ──
;WITH t AS (
    SELECT * FROM (VALUES
        ('R', 1, 0.628125), ('R', 2, 0.58125), ('R', 3, 0.534375), ('R', 4, 0.4875),
        ('C', 1, 0.69375),  ('C', 2, 0.6375),  ('C', 3, 0.58125),  ('C', 4, 0.525)
    ) v (iuso, itramo, pprima)
)
MERGE dbo.MATARIFA_ANTIGUEDAD_NEXUS AS d
USING t ON d.cramo = 16 AND d.iuso = t.iuso AND d.itramo = t.itramo
WHEN MATCHED THEN UPDATE SET pprima = t.pprima, fultmod = GETDATE(), cusuariomod = NULL
WHEN NOT MATCHED THEN INSERT (cramo, iuso, itramo, pprima, fultmod) VALUES (16, t.iuso, t.itramo, t.pprima, GETDATE());

-- ── b) Reparto (se reemplaza completo) ──
DELETE FROM dbo.MATARIFA_REPARTO_NEXUS WHERE cramo = 16;
INSERT INTO dbo.MATARIFA_REPARTO_NEXUS (cramo, ccober, ctarifa, itipo, pvalor, iopcional, plimite, fultmod)
SELECT 16, r.ccober, '1', r.itipo, r.pvalor, r.iopcional, r.plimite, GETDATE()
FROM (VALUES
    -- obligatorias: parte de lo que queda tras el terremoto
    ('1',  'P', 20,   0, NULL),
    ('26', 'P', 13,   0, 2.5),
    ('29', 'P', 4,    0, 5),
    -- opcionales del reparto: si el cliente no las elige, no paga su parte
    ('3',  'P', 15,   1, 30),
    ('4',  'P', 12,   1, 10),
    ('5',  'P', 12,   1, 15),
    ('30', 'P', 12,   1, 0.75),
    ('33', 'P', 12,   1, 3),
    ('2',  'F', 0.12, 1, NULL),
    -- incluidas con monto fijo
    ('28', 'M', 0.02, 0, 0.25),
    ('25', 'M', 0,    0, NULL),
    ('49', 'M', 0.02, 0, 0.5),
    ('50', 'M', 0.02, 0, 0.5),
    ('51', 'M', 0.02, 0, 0.5),
    ('52', 'M', 0.02, 0, 0.5),
    ('53', 'M', 0.02, 0, 5)
) r (ccober, itipo, pvalor, iopcional, plimite)
WHERE r.ccober NOT IN (SELECT ccober FROM @omitir);

-- ── c) RC General fuera del reparto: 0,08 % sobre su límite ──
UPDATE matarifa_d SET pprima = 0.08
WHERE cramo = 16 AND RTRIM(ccober) = '19' AND iestado = 'V';

-- ── d) Deducibles: % de la pérdida indemnizable y mínimo en US$ ──
;WITH ded AS (
    SELECT * FROM (VALUES
        ('26', 15, 300), ('29', 15, 300), ('4', 15, 300), ('5', 15, 300),
        ('30', 10, 300), ('33', 10, 300), ('19', 10, 300),
        -- «Demás coberturas»
        ('1', 10, 300), ('28', 10, 300),
        ('49', 10, 300), ('50', 10, 300), ('51', 10, 300), ('52', 10, 300), ('53', 10, 300)
    ) v (ccober, pct, minimo)
)
UPDATE d SET d.pdedu_fran = ded.pct, d.mdedu_franext = ded.minimo
FROM matarifa_d d
JOIN ded ON RTRIM(d.ccober) = ded.ccober
WHERE d.cramo = 16 AND d.iestado = 'V' AND ded.ccober NOT IN (SELECT ccober FROM @omitir);

COMMIT TRANSACTION;

-- ── Verificación ──
SELECT iuso, itramo, pprima FROM dbo.MATARIFA_ANTIGUEDAD_NEXUS WHERE cramo = 16 ORDER BY iuso, itramo;
SELECT r.ccober, RTRIM(c.xdescripcion_l) AS cobertura, r.itipo, r.pvalor, r.iopcional, r.plimite
FROM dbo.MATARIFA_REPARTO_NEXUS r
LEFT JOIN macoberturas c ON c.cramo = r.cramo AND RTRIM(c.ccobertura) = r.ccober
WHERE r.cramo = 16 ORDER BY r.itipo, TRY_CAST(r.ccober AS INT);
SELECT RTRIM(d.ccober) AS ccober, d.pprima, d.pdedu_fran, d.mdedu_franext
FROM matarifa_d d WHERE d.cramo = 16 AND d.iestado = 'V' AND (d.pdedu_fran > 0 OR RTRIM(d.ccober) = '19')
ORDER BY TRY_CAST(RTRIM(d.ccober) AS INT);
