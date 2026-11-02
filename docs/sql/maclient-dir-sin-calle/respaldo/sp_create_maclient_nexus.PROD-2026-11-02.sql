-- =============================================================================
-- sp_create_maclient_nexus · PRODUCCIÓN · profesión, ocupación y actividad por separado
-- Fecha: 2026-10-30
--
-- Base: la definición de PRODUCCIÓN exportada el 30-oct-2026 (respaldo/sp_create_maclient_nexus.PROD-2026-10-30.sql),
-- que ya trae el parche de la incidencia de profesiones del 29-oct:
--   - el código que llega en @cprofesion es una OCUPACIÓN y se guarda en cocupacion;
--   - @cprog vacío pasa a 'NEXUS'.
--
-- Cambios (marcados con [ocupacion 29-oct-2026]), los mismos aplicados y probados en QA:
--   1) Dos parámetros opcionales al final: @cocupacion y @bocupacion_separada (default 0).
--   2) @bocupacion_separada = 1: @cprofesion es la PROFESIÓN (maprofes) → cprofesion, y @cocupacion es la
--      OCUPACIÓN (maocupac) → cocupacion. Cada código se valida contra su catálogo.
--   3) @bocupacion_separada = 0 (todas las llamadas actuales): igual que hoy, @cprofesion es la ocupación.
-- Volver atrás: aplicar el respaldo.
-- =============================================================================
CREATE OR ALTER PROCEDURE [dbo].[sp_create_maclient_nexus]
    @icedula CHAR(1),
    @cci_rif NUMERIC(13, 0),
    @xnombre VARCHAR(120),
    @xapellido VARCHAR(120),
    @xcliente VARCHAR(250) = NULL,
    @isexo CHAR(1) = NULL,
    @iestado_civil CHAR(1) = NULL,
    @fnac DATETIME = NULL,
    @xcorreo VARCHAR(100) = NULL,
    @cpais SMALLINT = NULL,
    @cestado SMALLINT = NULL,
    @cciudad SMALLINT = NULL,
    @xdireccion VARCHAR(250) = NULL,
    @czonapos VARCHAR(10) = NULL,
    @xtelefono VARCHAR(20) = NULL,
    @ifuente VARCHAR(10) = NULL,
    @cid VARCHAR(15) = NULL,
    @npeso NUMERIC(6,2) = NULL,
    @nestatura NUMERIC(8,2) = NULL,
    @cusuario NUMERIC(20) = NULL,
    @cprog NVARCHAR(10) = NULL,
    -- Con @bocupacion_separada = 0 Nexus envía aquí la OCUPACIÓN (maocupac) y se guarda en cocupacion.
    -- Con @bocupacion_separada = 1 es la PROFESIÓN (maprofes) y se guarda en cprofesion.
    @cprofesion SMALLINT = NULL,
    @cactividad NUMERIC(18,0) = NULL,
    -- [ocupacion 29-oct-2026] Ocupación (maocupac) cuando la profesión viene aparte en @cprofesion.
    @cocupacion SMALLINT = NULL,
    @bocupacion_separada BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Sin cprog no queda rastro del programa que escribió el cliente (incidencia de profesiones, 2026-10).
    SET @cprog = ISNULL(NULLIF(LTRIM(RTRIM(@cprog)), N''), N'NEXUS');

    DECLARE @ipersona CHAR(1), 
            @itipopers CHAR(1),
            @xprefijo NVARCHAR(3);

    -- Manejo de Transacción Atómica
    DECLARE @TranStarted BIT = 0;
    IF @@TRANCOUNT = 0
    BEGIN
        BEGIN TRANSACTION;
        SET @TranStarted = 1;
    END;

    BEGIN TRY
        -- Ajustes por defecto de parámetros
        IF (@icedula IS NULL) SET @icedula = 'V';

        -- Evitar cid='0' (llamadas legacy pasan 0 en el slot de @salida del SP clásico;
        -- en nexus ese slot es @cid y rompe el unique maclientI2).
        IF (@cid IS NULL OR LTRIM(RTRIM(CONVERT(VARCHAR(30), @cid))) IN ('', '0'))
            SET @cid = CONCAT(@icedula, '-', CONVERT(VARCHAR(20), @cci_rif));

        IF (@xcliente IS NULL) 
            SET @xcliente = NULLIF(TRIM(CONCAT(@xnombre, ' ', @xapellido)), '');

        -- Mapeo correcto de Tipo de Persona
        SELECT 
            @itipopers = CASE @icedula 
                            WHEN 'V' THEN 'L'
                            WHEN 'E' THEN 'E'
                            WHEN 'J' THEN 'N'
                            WHEN 'G' THEN 'G'
                            ELSE 'L'
                         END,
            @ipersona  = CASE @icedula 
                            WHEN 'J' THEN 'J'
                            WHEN 'G' THEN 'G'
                            ELSE 'N'
                         END;

        SET @xprefijo = CASE @isexo 
                            WHEN 'F' THEN 'Sra'
                            WHEN 'M' THEN 'Sr'
                        END;

        ----------------------------------------------------
        -- 1. MACLIENT (UPSERT)
        ----------------------------------------------------
        IF NOT EXISTS(SELECT 1 FROM maclient WHERE cci_rif = @cci_rif) 
        BEGIN 
            INSERT INTO maclient (
                cci_rif, u_version, ipersona, cid, cdv_cliente, itipopers, cnit, xprefijo, 
                xapellido_1, xapellido_2, xnombre_1, xnombre_2, xnombre, xapellido, xcliente, 
                fnacimiento, isexo, iestado_civil, npeso, nestatura, iestado, cprog, 
                ifuente, bok, cerror, fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod, ccategoriamod
            )
            VALUES (
                @cci_rif, '!', @ipersona, @cid, NULL, @itipopers, NULL, @xprefijo, 
                @xapellido, NULL, @xnombre, NULL, @xnombre, @xapellido, @xcliente, 
                @fnac, @isexo, @iestado_civil, @npeso, @nestatura, 'V', @cprog, 
                @ifuente, 0, 0, GETDATE(), @cusuario, NULL, NULL, NULL, NULL, NULL, NULL
            );
        END
        ELSE 
        BEGIN
            UPDATE maclient SET
                u_version = ISNULL(u_version, '!'),
                ipersona = ISNULL(ipersona, @ipersona),
                cid = CASE
                    WHEN cid IS NULL OR LTRIM(RTRIM(CONVERT(VARCHAR(30), cid))) IN ('', '0') THEN @cid
                    ELSE cid
                END,
                xnombre_1 = ISNULL(xnombre_1, @xnombre),
                xapellido_1 = ISNULL(xapellido_1, @xapellido),
                xnombre = ISNULL(xnombre, @xnombre),
                xapellido = ISNULL(xapellido, @xapellido),
                xcliente = ISNULL(xcliente, @xcliente),
                fnacimiento = ISNULL(fnacimiento, @fnac),
                isexo = ISNULL(isexo, @isexo),
                iestado_civil = ISNULL(iestado_civil, @iestado_civil),
                npeso = ISNULL(npeso, @npeso),
                nestatura = ISNULL(nestatura, @nestatura),
                iestado = ISNULL(iestado, 'V'),
                cprog = @cprog,
                ifuente = ISNULL(ifuente, @ifuente),
                itipopers = ISNULL(itipopers, @itipopers),
                fultmod = GETDATE(),
                cusuariomod = @cusuario,
                ccategoriamod = 1
            WHERE cci_rif = @cci_rif;
        END;

        ----------------------------------------------------
        -- 2. MACLIENT_CORREO (UPSERT)
        ----------------------------------------------------
        IF @xcorreo IS NOT NULL AND TRIM(@xcorreo) <> ''
        BEGIN
            IF NOT EXISTS(SELECT 1 FROM maclient_correo WHERE cci_rif = @cci_rif) 
            BEGIN 
                INSERT INTO maclient_correo (
                    cci_rif, cclave_num, u_version, itipocorreo, xcorreo, mcliente_dircob, cprog, ifuente, bok, cerror, fingreso, 
                    cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod, ccategoriamod
                )
                VALUES (
                    @cci_rif, 1, '!', 'P', @xcorreo, NULL, @cprog, @ifuente, 0, 0, GETDATE(), 
                    @cusuario, NULL, NULL, NULL, NULL, NULL, NULL
                );
            END
            ELSE 
            BEGIN 
                UPDATE maclient_correo SET
                    xcorreo = @xcorreo,
                    cprog = @cprog,
                    ifuente = ISNULL(ifuente, @ifuente),
                    fultmod = GETDATE(),
                    cusuariomod = @cusuario,
                    ccategoriamod = 1
                WHERE cci_rif = @cci_rif;
            END;
        END;

        ----------------------------------------------------
        -- 3. MACLIENT_DIR (UPSERT)
        ----------------------------------------------------
        IF @xdireccion IS NOT NULL AND TRIM(@xdireccion) <> ''
        BEGIN
            IF NOT EXISTS(SELECT 1 FROM maclient_dir WHERE cci_rif = @cci_rif) 
            BEGIN 
                INSERT INTO maclient_dir (
                    cci_rif, cclave_num, u_version, itipodirec, icondviv, itipoviv, xavecalle, xedifqta, xpiso, xnumero, xurbsector, xaparpost, cpais, cestado, cciudad, ccorregi, cbarriada, czonapos, cprog, ifuente, bok, cerror, fingreso, 
                    cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod, ccategoriamod
                )
                VALUES (
                    @cci_rif, 1, '!', 'H', 'P', 'C', @xdireccion, NULL, NULL, NULL, NULL, NULL, @cpais, @cestado, @cciudad, NULL, NULL, @czonapos, @cprog, @ifuente, 0, 0, GETDATE(), 
                    @cusuario, NULL, NULL, NULL, NULL, NULL, NULL
                );
            END
            ELSE 
            BEGIN 
                UPDATE maclient_dir SET
                    xavecalle = @xdireccion,
                    cpais = ISNULL(@cpais, cpais),
                    cestado = ISNULL(@cestado, cestado),
                    cciudad = ISNULL(@cciudad, cciudad),
                    czonapos = ISNULL(@czonapos, czonapos),
                    cprog = @cprog,
                    ifuente = ISNULL(ifuente, @ifuente),
                    fultmod = GETDATE(),
                    cusuariomod = @cusuario,
                    ccategoriamod = 1
                WHERE cci_rif = @cci_rif;
            END;
        END;

        ----------------------------------------------------
        -- 4. MACLIENT_TEL (UPSERT)
        ----------------------------------------------------
        IF @xtelefono IS NOT NULL AND TRIM(@xtelefono) <> ''
        BEGIN
            IF NOT EXISTS(SELECT 1 FROM maclient_tel WHERE cci_rif = @cci_rif) 
            BEGIN
                INSERT INTO maclient_tel(
                    cci_rif, cclave_num, u_version, itipotel, xtelefono, mcliente_dircob, cprog, ifuente, bok, cerror, fingreso, cusuario, 
                    ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod, ccategoriamod
                )
                VALUES (
                    @cci_rif, 1, '!', 'C', @xtelefono, NULL, @cprog, @ifuente, 0, 0, GETDATE(), @cusuario, 
                    NULL, NULL, NULL, NULL, NULL, NULL
                );
            END
            ELSE 
            BEGIN 
                UPDATE maclient_tel SET
                    xtelefono = @xtelefono,
                    cprog = @cprog,
                    ifuente = ISNULL(ifuente, @ifuente),
                    fultmod = GETDATE(),
                    cusuariomod = @cusuario,
                    ccategoriamod = 1
                WHERE cci_rif = @cci_rif;
            END;
        END;


        ----------------------------------------------------
        -- 5. MACLIENT_ATR (UPSERT) - Circular SAA-02-1079-2026
        ----------------------------------------------------
        -- Cada código se guarda solo si existe en su catálogo: profesión en maprofes, ocupación en maocupac.
        -- [ocupacion 29-oct-2026] Sin @bocupacion_separada (llamadas actuales) @cprofesion trae la ocupación
        -- y la profesión no se toca, como hasta ahora.
        DECLARE @cprofesion_atr SMALLINT = NULL,
                @cocupacion_atr SMALLINT = NULL;

        IF ISNULL(@bocupacion_separada, 0) = 1
        BEGIN
            SET @cprofesion_atr = (SELECT TOP 1 cprofesion FROM maprofes WHERE cprofesion = @cprofesion);
            SET @cocupacion_atr = (SELECT TOP 1 cocupacion FROM maocupac WHERE cocupacion = @cocupacion);
        END
        ELSE
            SET @cocupacion_atr = (SELECT TOP 1 cocupacion FROM maocupac WHERE cocupacion = @cprofesion);

        IF (@cprofesion_atr IS NOT NULL OR @cocupacion_atr IS NOT NULL OR @cactividad IS NOT NULL)
        BEGIN
            IF NOT EXISTS(SELECT 1 FROM maclient_atr WHERE cci_rif = @cci_rif)
            BEGIN
                INSERT INTO maclient_atr (
                    cci_rif, u_version, cprofesion, cocupacion, cactividad, cprog, ifuente, bok, cerror, fingreso, cusuario
                )
                VALUES (
                    @cci_rif, '!', ISNULL(@cprofesion_atr, 0), @cocupacion_atr, @cactividad, @cprog, @ifuente, 0, 0, GETDATE(), @cusuario
                );
            END
            ELSE
            BEGIN
                UPDATE maclient_atr SET
                    cprofesion = COALESCE(@cprofesion_atr, cprofesion),
                    cocupacion = COALESCE(@cocupacion_atr, cocupacion),
                    cactividad = COALESCE(@cactividad, cactividad),
                    cprog = @cprog,
                    ifuente = ISNULL(ifuente, @ifuente),
                    fultmod = GETDATE(),
                    cusuariomod = @cusuario,
                    ccategoriamod = 1
                WHERE cci_rif = @cci_rif;
            END;
        END;

        IF @TranStarted = 1 AND @@TRANCOUNT > 0
        BEGIN
            COMMIT TRANSACTION;
        END;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRANSACTION;
        END;

        DECLARE @ErrorMessage NVARCHAR(4000) = 'Fallo en sp_create_maclient_nexus (Cliente RIF ' + CAST(@cci_rif AS NVARCHAR(20)) + '). Error Interno: ' + ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();
        
        RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH
END;
GO
