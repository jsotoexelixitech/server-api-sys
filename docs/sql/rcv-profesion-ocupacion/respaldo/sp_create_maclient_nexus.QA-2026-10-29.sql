-- =============================================================================
-- sp_create_maclient_nexus (QA) - profesión inexistente en el CORE
--
-- Incidencia: clientes emitidos por Nexus (RCV y personas) quedan con maclient_atr.cprofesion en códigos
-- que no existen en maprofes. El front envía en "cprofesion" un código de maocupac (ocupaciones).
--
-- Cambios (solo esto; el resto es la versión vigente de QA):
--   1. Bloque 5 (maclient_atr): el código se guarda en cocupacion, validado contra maocupac; cprofesion
--      queda en 0 al insertar y no se toca al actualizar.
--   2. @cprog vacío pasa a 'NEXUS' para que quede trazabilidad en todas las tablas del cliente.
-- Los SP que lo llaman (sp_emision_automovil_rcv_nexus, sp_emision_personas_general_nexus) no cambian.
-- Datos ya grabados: corregir-maclient-atr-ocupacion-nexus.sql
-- =============================================================================
CREATE   PROCEDURE [dbo].[sp_create_maclient_nexus]
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
    -- Nexus envía aquí el código de OCUPACIÓN (maocupac, catálogo sp_get_ocupaciones_nexus); se guarda en cocupacion.
    @cprofesion SMALLINT = NULL,
    @cactividad NUMERIC(18,0) = NULL
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
        -- 0. CID duplicado (maclientI2 es unico por cid)
        ----------------------------------------------------
        -- Cliente nuevo (no existe ese cci_rif) cuyo cid ya lo usa OTRO cci_rif: dato inconsistente, p. ej.
        -- captura erronea en MAMCLIEN (cci_rif 7950971 con cid 'V-7950917'). Sin esto el INSERT falla con
        -- "Cannot insert duplicate key row ... maclientI2".
        --   @auto_corregir_cid = 1: si el cid pedido es el canonico de este RIF (<letra>-<cci_rif>), el cid
        --                           del otro cliente se corrige a su forma canonica (<letra>-<su cci_rif>) y se continua.
        --   @auto_corregir_cid = 0: solo se informa el conflicto, sin tocar datos.
        -- Si no se puede corregir sin generar otro conflicto, se informa cuales cci_rif estan en conflicto.
        DECLARE @auto_corregir_cid BIT = 1;

        IF NOT EXISTS (SELECT 1 FROM maclient WHERE cci_rif = @cci_rif)
           AND EXISTS (SELECT 1 FROM maclient WHERE cid = @cid)
        BEGIN
            DECLARE @cci_rif_otro NUMERIC(13, 0),
                    @cid_otro VARCHAR(30),
                    @cid_canonico_otro VARCHAR(30);

            SELECT TOP 1 @cci_rif_otro = cci_rif, @cid_otro = LTRIM(RTRIM(cid))
            FROM maclient
            WHERE cid = @cid
            ORDER BY cci_rif;

            SET @cid_canonico_otro = CONCAT(
                ISNULL(NULLIF(LEFT(@cid_otro, 1), ''), 'V'), '-', CONVERT(VARCHAR(20), @cci_rif_otro));

            IF @auto_corregir_cid = 1
               AND LTRIM(RTRIM(@cid)) = CONCAT(LEFT(LTRIM(RTRIM(@cid)), 1), '-', CONVERT(VARCHAR(20), @cci_rif))
               AND @cid_canonico_otro <> LTRIM(RTRIM(@cid))
               AND NOT EXISTS (SELECT 1 FROM maclient WHERE cid = @cid_canonico_otro AND cci_rif <> @cci_rif_otro)
            BEGIN
                UPDATE maclient SET
                    cid = @cid_canonico_otro,
                    fultmod = GETDATE(),
                    cusuariomod = @cusuario,
                    ccategoriamod = 1
                WHERE cci_rif = @cci_rif_otro AND cid = @cid;
            END
            ELSE
            BEGIN
                DECLARE @msg_cid NVARCHAR(400) = CONCAT(
                    'El cid ', @cid, ' ya lo usa el cliente con cci_rif ', CONVERT(VARCHAR(20), @cci_rif_otro),
                    '; no coincide con el RIF ', CONVERT(VARCHAR(20), @cci_rif),
                    '. Corrija el cid del cliente ', CONVERT(VARCHAR(20), @cci_rif_otro), ' en maclient.');
                THROW 99002, @msg_cid, 1;
            END;
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
        	DECLARE @lenAveCalle INT = COL_LENGTH('dbo.maclient_dir', 'xavecalle'),
                    @lenUrbSector INT = COL_LENGTH('dbo.maclient_dir', 'xurbsector'),
                    @direccion VARCHAR(250) = LTRIM(RTRIM(@xdireccion)),
                    @ultimaComa INT,
                    @posComa INT,
                    @xavecalle VARCHAR(250),
                    @xurbsector VARCHAR(250) = NULL;

            IF LEN(@direccion) <= @lenAveCalle
                SET @xavecalle = @direccion;
            ELSE
            BEGIN
                -- Posición (desde el final) de la última coma que cabe en xavecalle; 0 si no hay.
                SET @ultimaComa = CHARINDEX(',', REVERSE(LEFT(@direccion, @lenAveCalle)));

                IF @ultimaComa > 0
                BEGIN
                    SET @posComa = @lenAveCalle - @ultimaComa + 1;
                    SET @xavecalle = RTRIM(LEFT(@direccion, @posComa - 1));
                    SET @xurbsector = LTRIM(SUBSTRING(@direccion, @posComa + 1, 250));
                END
                ELSE
                BEGIN
                    SET @xavecalle = LEFT(@direccion, @lenAveCalle);
                    SET @xurbsector = LTRIM(SUBSTRING(@direccion, @lenAveCalle + 1, 250));
                END;

                SET @xurbsector = NULLIF(LEFT(@xurbsector, @lenUrbSector), '');
            END;
        BEGIN
            IF NOT EXISTS(SELECT 1 FROM maclient_dir WHERE cci_rif = @cci_rif) 
            BEGIN 
                INSERT INTO maclient_dir (
                    cci_rif, cclave_num, u_version, itipodirec, icondviv, itipoviv, xavecalle, xedifqta, xpiso, xnumero, xurbsector, xaparpost, cpais, cestado, cciudad, ccorregi, cbarriada, czonapos, cprog, ifuente, bok, cerror, fingreso, 
                    cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod, ccategoriamod
                )
                VALUES (
                    @cci_rif, 1, '!', 'H', 'P', 'C', @xavecalle, NULL, NULL, NULL, @xurbsector, NULL, @cpais, @cestado, @cciudad, NULL, NULL, @czonapos, @cprog, @ifuente, 0, 0, GETDATE(), 
                    @cusuario, NULL, NULL, NULL, NULL, NULL, NULL
                );
            END
            ELSE 
            BEGIN 
                UPDATE maclient_dir SET
                    xavecalle = @xavecalle,
                    xurbsector = @xurbsector,
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
        -- El campo "Profesión" de Nexus usa el catálogo de ocupaciones (maocupac). Antes se grababa en
        -- cprofesion, que apunta a maprofes (3 registros), y quedaban profesiones inexistentes en el CORE.
        -- Ahora va a cocupacion y solo si el código existe en maocupac; cprofesion no se toca.
        DECLARE @cocupacion SMALLINT = (SELECT TOP 1 cocupacion FROM maocupac WHERE cocupacion = @cprofesion);

        IF (@cocupacion IS NOT NULL OR @cactividad IS NOT NULL)
        BEGIN
            IF NOT EXISTS(SELECT 1 FROM maclient_atr WHERE cci_rif = @cci_rif)
            BEGIN
                INSERT INTO maclient_atr (
                    cci_rif, u_version, cprofesion, cocupacion, cactividad, cprog, ifuente, bok, cerror, fingreso, cusuario
                )
                VALUES (
                    @cci_rif, '!', 0, @cocupacion, @cactividad, @cprog, @ifuente, 0, 0, GETDATE(), @cusuario
                );
            END
            ELSE
            BEGIN
                UPDATE maclient_atr SET
                    cocupacion = COALESCE(@cocupacion, cocupacion),
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
