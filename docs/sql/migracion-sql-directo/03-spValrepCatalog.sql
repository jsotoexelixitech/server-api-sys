/*
  nest-api — reemplaza SQL directo en producción
  ─────────────────────────────────────────────
  valrep.service.ts
    getMatipos   → @catalogo=MATIPOS
    getMacategtr → @catalogo=MACATEGR, @ctipo

  SQL reemplazado:
    SELECT ctipo, TRIM(xtipo) FROM matipos ORDER BY ctipo
    SELECT ccategotr, TRIM(xcategoria) FROM macategtr WHERE ctipo=@ctipo
*/

CREATE OR ALTER PROCEDURE [dbo].[spValrepCatalog]
    @catalogo VARCHAR(20),
    @ctipo    SMALLINT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @catalogo = 'MATIPOS'
    BEGIN
        SELECT ctipo, TRIM(xtipo) AS xtipo FROM matipos ORDER BY ctipo;
        RETURN;
    END

    IF @catalogo = 'MACATEGR'
    BEGIN
        SELECT ccategotr, TRIM(xcategoria) AS xcategoria
        FROM macategtr
        WHERE ctipo = @ctipo
        ORDER BY xcategoria;
        RETURN;
    END

    THROW 99001, 'catalogo inválido en spValrepCatalog (MATIPOS | MACATEGR).', 1;
END;
