-- =============================================================================
-- Catálogo de profesiones (maprofes) · PRODUCCIÓN · OPCIONAL
-- Fecha: 2026-10-30
--
-- REQUIERE APROBACIÓN DEL DUEÑO DEL CATÁLOGO: es un maestro del core.
--
-- La profesión es obligatoria en RCV y en personas. En producción maprofes tiene 3 filas
-- (1 ADMINISTRADOR, 2 CONTADOR, 3 INGENIERO); en QA hay 36, con los mismos códigos 1-3.
-- Entre las que faltan está ESTUDIANTE (14), la única opción válida para un menor de edad.
--
-- Qué hace: inserta las profesiones de QA cuyo código no existe en producción. No modifica
-- filas existentes. Si un código ya existe con otro nombre lo informa y no lo toca.
-- Se puede correr más de una vez. Guardar y ejecutar como UTF-8 (sqlcmd -f 65001).
-- =============================================================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @qa TABLE (cprofesion SMALLINT PRIMARY KEY, xprofesion NVARCHAR(60));
INSERT INTO @qa (cprofesion, xprofesion) VALUES
    (1, N'ADMINISTRADOR'),
    (2, N'CONTADOR'),
    (3, N'INGENIERO'),
    (4, N'BARMAN'),
    (5, N'COMERCIANTE'),
    (6, N'CHOFER'),
    (7, N'ABOGADO'),
    (8, N'JARDINERO'),
    (9, N'LATONERO'),
    (10, N'MESONERO'),
    (11, N'ODONTÓLOGO'),
    (12, N'PANADERO'),
    (13, N'PILOTO'),
    (14, N'ESTUDIANTE'),
    (15, N'EDUCADOR'),
    (16, N'TAXISTA'),
    (17, N'URÓLOGO'),
    (18, N'MÉDICO'),
    (19, N'OFTALMÓLOGO'),
    (20, N'MECÁNICO'),
    (21, N'AMA DE CASA'),
    (22, N'VENDEDOR'),
    (23, N'PSICÓLOGO'),
    (24, N'PELOTERO'),
    (25, N'DEPORTISTA'),
    (26, N'DECORADOR'),
    (27, N'PINTOR'),
    (28, N'ARTESANO'),
    (29, N'CARPINTERO'),
    (30, N'TALABARTERO'),
    (31, N'JINETE'),
    (32, N'PASTELERO'),
    (33, N'JOYERO'),
    (34, N'TEC. ELECTRÓNICA'),
    (35, N'DIPLOMATICO'),
    (36, N'ARQUITECTO');

-- Códigos que ya existen con otro nombre: se informan y no se tocan.
SELECT p.cprofesion, RTRIM(p.xprofesion) AS en_produccion, q.xprofesion AS en_qa
FROM dbo.maprofes p JOIN @qa q ON q.cprofesion = p.cprofesion
WHERE RTRIM(p.xprofesion) COLLATE DATABASE_DEFAULT <> q.xprofesion COLLATE DATABASE_DEFAULT;

BEGIN TRAN;

INSERT INTO dbo.maprofes (cprofesion, u_version, xprofesion, iestado, cprog, fingreso, cusuario, ccategoria)
SELECT q.cprofesion, '!', q.xprofesion, 'V', 'NEXUS', GETDATE(), 1, 1
FROM @qa q
WHERE NOT EXISTS (SELECT 1 FROM dbo.maprofes p WHERE p.cprofesion = q.cprofesion);

SELECT @@ROWCOUNT AS profesiones_insertadas;

COMMIT;

SELECT iestado, COUNT(*) AS filas FROM dbo.maprofes GROUP BY iestado;
