/*
  nest-api — reemplaza SQL directo en producción
  ─────────────────────────────────────────────
  inma.service.ts
    getAnios          → @accion=ANIOS
    getMarcas         → @accion=MARCAS
    getModelo         → @accion=MODELOS
    getVersion        → @accion=VERSIONES
    getCategoriasUso  → @accion=CATEGORIAS_USO (2 queries: VInma + macategtr)
  valrep.service.ts
    getCotizacionAuto → @accion=VINMA_TIPO_PUESTOS

  SQL reemplazado (req.query en nest-api):
    SELECT MAX/MIN(cano) FROM VInma
    SELECT DISTINCT cmarca,xmarca FROM VInma WHERE cano=...
    SELECT DISTINCT cmodelo,... FROM VInma WHERE cano AND cmarca
    SELECT DISTINCT cversion,... FROM VInma WHERE cano,cmarca,cmodelo
    SELECT TOP 1 ctipo FROM VInma + SELECT ccategotr FROM macategtr
    SELECT ctipo, npasajero FROM VInma (cotización)
*/
-- @accion: ANIOS | MARCAS | MODELOS | VERSIONES | CATEGORIAS_USO | VINMA_TIPO_PUESTOS

CREATE OR ALTER PROCEDURE [dbo].[spInmaCatalog]
    @accion   VARCHAR(20),
    @fano     INT         = NULL,
    @ctipo    INT         = NULL,
    @cmarca   VARCHAR(4)  = NULL,
    @cmodelo  VARCHAR(4)  = NULL,
    @cversion VARCHAR(4)  = NULL,
    @cano     INT         = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @accion = 'ANIOS'
    BEGIN
        SELECT MAX(cano) AS [max], MIN(cano) AS [min] FROM VInma;
        RETURN;
    END

    IF @accion = 'MARCAS'
    BEGIN
        SELECT DISTINCT TRIM(cmarca) AS cmarca, TRIM(xmarca) AS xmarca
        FROM VInma
        WHERE cano = @fano
          AND (@ctipo IS NULL OR ctipo = @ctipo)
        ORDER BY xmarca;
        RETURN;
    END

    IF @accion = 'MODELOS'
    BEGIN
        SELECT DISTINCT
            TRIM(cmodelo) AS cmodelo,
            TRIM(cmarca)  AS cmarca,
            TRIM(xmodelo) AS xmodelo
        FROM VInma
        WHERE cano = @fano
          AND cmarca = UPPER(LTRIM(RTRIM(@cmarca)))
        ORDER BY xmodelo;
        RETURN;
    END

    IF @accion = 'VERSIONES'
    BEGIN
        SELECT DISTINCT
            TRIM(cversion)       AS cversion,
            TRIM(xversion)       AS xversion,
            TRIM(cmarca)         AS cmarca,
            TRIM(cmodelo)        AS cmodelo,
            mvalor, ctipo, npasajero, ccategotr,
            TRIM(xclasificacion) AS xclasificacion,
            ctarifabi,
            TRIM(xtipo)          AS xtipo,
            ROUND(mvalor * 0.9, 2) AS mvalormin,
            ROUND(mvalor * 1.3, 2) AS mvalormax
        FROM VInma
        WHERE cano    = @fano
          AND cmarca  = UPPER(LTRIM(RTRIM(@cmarca)))
          AND cmodelo = UPPER(LTRIM(RTRIM(@cmodelo)))
        ORDER BY xversion;
        RETURN;
    END

    IF @accion = 'CATEGORIAS_USO'
    BEGIN
        DECLARE @ctipoVinma INT;

        SELECT TOP 1 @ctipoVinma = ctipo
        FROM VInma
        WHERE cmarca   = UPPER(LTRIM(RTRIM(@cmarca)))
          AND cmodelo  = UPPER(LTRIM(RTRIM(@cmodelo)))
          AND cversion = UPPER(LTRIM(RTRIM(@cversion)))
          AND cano     = @cano;

        IF @ctipoVinma IS NULL
        BEGIN
            SELECT CAST(NULL AS VARCHAR(10)) AS ccategoria_uso,
                   CAST(NULL AS VARCHAR(200)) AS xcategoria_uso
            WHERE 1 = 0;
            RETURN;
        END

        SELECT ccategotr AS ccategoria_uso, TRIM(xcategoria) AS xcategoria_uso
        FROM macategtr
        WHERE ctipo = CAST(@ctipoVinma AS VARCHAR(10))
        ORDER BY xcategoria;
        RETURN;
    END

    IF @accion = 'VINMA_TIPO_PUESTOS'
    BEGIN
        SELECT TOP 1 ctipo, npasajero
        FROM VInma
        WHERE cmarca   = @cmarca
          AND cmodelo  = @cmodelo
          AND cversion = @cversion
          AND cano     = @cano;
        RETURN;
    END

    THROW 99001, 'accion inválida en spInmaCatalog.', 1;
END;
