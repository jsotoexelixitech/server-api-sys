-- =============================================================================
-- Prueba de sp_create_maclient_nexus · dirección sin calle
-- Correr DESPUÉS de aplicar 01 (QA) o 02 (PROD). Todo se deshace con ROLLBACK.
-- La cédula 99000001 es ficticia; confirmar antes que no exista:
--   SELECT 1 FROM maclient WHERE cci_rif = 99000001;
-- =============================================================================
BEGIN TRAN;

-- Caso 1: cliente nuevo con estado y ciudad, sin calle → debe crear la fila en maclient_dir.
EXEC sp_create_maclient_nexus
    @icedula = 'V', @cci_rif = 99000001, @xnombre = 'PRUEBA', @xapellido = 'SIN CALLE',
    @cpais = 58, @cestado = 24, @cciudad = 201, @xdireccion = '', @ifuente = 'API';

SELECT 'caso 1' AS caso, cci_rif, cpais, cestado, cciudad, xavecalle
FROM maclient_dir WHERE cci_rif = 99000001;
-- Esperado: 1 fila · cpais 58 · cestado 24 · cciudad 201 · xavecalle NULL (o '' en QA)

-- Caso 2: el mismo cliente vuelve sin calle y con otro estado → no se toca la dirección existente.
EXEC sp_create_maclient_nexus
    @icedula = 'V', @cci_rif = 99000001, @xnombre = 'PRUEBA', @xapellido = 'SIN CALLE',
    @cpais = 58, @cestado = 8, @cciudad = 93, @xdireccion = NULL, @ifuente = 'API';

SELECT 'caso 2' AS caso, cci_rif, cestado, cciudad, xavecalle
FROM maclient_dir WHERE cci_rif = 99000001;
-- Esperado: sigue cestado 24 · cciudad 201

-- Caso 3: llega con calle → se actualiza como siempre.
EXEC sp_create_maclient_nexus
    @icedula = 'V', @cci_rif = 99000001, @xnombre = 'PRUEBA', @xapellido = 'SIN CALLE',
    @cpais = 58, @cestado = 8, @cciudad = 93, @xdireccion = 'AV BOLIVAR', @ifuente = 'API';

SELECT 'caso 3' AS caso, cci_rif, cestado, cciudad, xavecalle
FROM maclient_dir WHERE cci_rif = 99000001;
-- Esperado: cestado 8 · cciudad 93 · xavecalle AV BOLIVAR

ROLLBACK;
