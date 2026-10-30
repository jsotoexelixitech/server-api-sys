-- =============================================================================
-- sp_pre_emision_personas_general_nexus - v3: recargo / descuento por asegurado
-- Fecha: 2026-10-05 · Solicitado por: Exélixi (emisión personas vía nest-api)
--
-- Cambios respecto a la versión vigente en QA (nada más cambia):
--   1. Lee precargo y pdescuento (%) de cada asegurado del JSON @asegurados y los guarda
--      en TMEMISION_PERSONAS_GENERAL_ASEG (columnas nuevas, ver
--      alter-tmemision-personas-general-aseg-precargo.sql). Si no vienen, 0.
--   2. Parámetros nuevos @precargo_titular y @pdescuento_titular (al final de la lista,
--      NULL por defecto): % del titular. Se aplican a la fila del titular en _ASEG
--      (xrif_asegurado = @xrif_titular). Si el titular no está en @asegurados y llega
--      algún % distinto de 0, se inserta su fila con los datos de la cabecera. Sin esos
--      parámetros el titular queda en 0 y lo que se emite hoy no cambia.
--   El cálculo del recargo/descuento lo hace sp_emision_personas_general_nexus v3.
--
-- [personas-profesion 30-oct-2026] Profesión (maprofes), ocupación (maocupac) y actividad
-- económica (maactivi) del tomador, el titular y cada asegurado. Requiere
-- 0_alter_tmemision_personas_general.sql.
--   1. Parámetros nuevos al final (NULL por defecto): @cprofesion_/@cocupacion_/@cactividad_
--      _tomador y _titular. Se guardan en TMEMISION_PERSONAS_GENERAL.
--   2. Cada asegurado del JSON puede traer cprofesion_asegurado, cocupacion_asegurado y
--      cactividad_asegurado. Se guardan en TMEMISION_PERSONAS_GENERAL_ASEG.
--   3. Si el titular es el tomador, hereda lo que le falte del tomador; la fila del titular en
--      _ASEG hereda lo que le falte del titular.
--   Sin los datos nuevos todo queda NULL y la emisión es la misma de hoy.
-- =============================================================================
CREATE OR ALTER PROCEDURE [dbo].[sp_pre_emision_personas_general_nexus]
    @id int = NULL,
    @cnpoliza_rel varchar(30) = NULL,
    @cplan varchar(10) = NULL,
    @cramo int = NULL,
    @xcanal_venta varchar(250) = NULL,
    @icedula_tomador char(1) = NULL,
    @xrif_tomador numeric(9) = NULL,
    @xnombre_tomador varchar(250) = NULL,
    @xapellido_tomador varchar(250) = NULL,
    @isexo_tomador char(1) = NULL,
    @iestado_civil_tomador char(1) = NULL,
    @fnac_tomador datetime = NULL,
    @cestado_tomador varchar(100) = NULL,
    @cciudad_tomador varchar(100) = NULL,
    @xdireccion_tomador varchar(1000) = NULL,
    @xtelefono_tomador varchar(250) = NULL,
    @xcorreo_tomador varchar(250) = NULL,
    @icedula_titular char(1) = NULL,
    @xrif_titular numeric(9) = NULL,
    @xnombre_titular varchar(250) = NULL,
    @xapellido_titular varchar(250) = NULL,
    @isexo_titular char(1) = NULL,
    @iestado_civil_titular char(1) = NULL,
    @fnac_titular datetime = NULL,
    @cestado_titular varchar(100) = NULL,
    @cciudad_titular varchar(100) = NULL,
    @xdireccion_titular varchar(1000) = NULL,
    @xtelefono_titular varchar(250) = NULL,
    @xcorreo_titular varchar(250) = NULL,
    @cpersona_politica char(1) = NULL,
    @cterm_y_cod char(1) = NULL,
    @cdiagnos_enferm char(1) = NULL,
    @xdiagnos_enferm varchar(1000) = NULL,
    @cproductor int = NULL,
    @ptasamon numeric(18,6) = NULL,
    @cmoneda char(4) = NULL,
    @msumaaseg numeric(18,2) = NULL,
    @mprimaext numeric(18,2) = NULL,
    @ifrecuencia char(1) = NULL,
    @femision datetime = NULL,
    @fdesde date = NULL,
    @fhasta date = NULL,
    @corigen_rel CHAR(2) = NULL,
    @api varchar(100) = NULL,
    @method varchar(100) = NULL,
    @cprog char(20) = NULL,
    @ifuente char(10) = NULL,
    @fingreso datetime = NULL,
    @cpoliza NUMERIC(19) = NULL,
    @cnpoliza varchar(30) = NULL,
    @cproces NUMERIC(13) = NULL,
    @ccanalalt int = NULL,
    @cscanalalt int = NULL,
    @ctipocanal CHAR(1) = NULL,
    @asegurados NVARCHAR(MAX) = NULL,
    @beneficiarios NVARCHAR(MAX) = NULL,
    @cusuario INT = NULL,
    @precargo_titular numeric(13,2) = NULL,
    @pdescuento_titular numeric(13,2) = NULL,
    -- [personas-profesion 30-oct-2026]
    @cprofesion_tomador SMALLINT = NULL,
    @cocupacion_tomador SMALLINT = NULL,
    @cactividad_tomador NUMERIC(18,0) = NULL,
    @cprofesion_titular SMALLINT = NULL,
    @cocupacion_titular SMALLINT = NULL,
    @cactividad_titular NUMERIC(18,0) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @pcomision numeric(9, 2), @qcontador numeric(18, 0), @POL_RAMO VARCHAR(20),
        @minedad char(3), @maxedad char(3), @error VARCHAR(200),
        @cnrecibo varchar(50), @crecibo numeric(19), @csucur int,
        @iestado INT, @xestado VARCHAR(30), @xlog VARCHAR(1000),
        @pSuccess BIT, @pErrorMessage NVARCHAR(MAX),
        @cgestor VARCHAR(30)

    -- Productor por defecto a Directo
    IF @cproductor = 0 OR @cproductor IS NULL
    BEGIN
        SELECT @cproductor = 80080;
    END

    IF @cramo IS NULL
    BEGIN
        SELECT @cramo = cramo from maplanes_per WHERE cplan = @cplan and iestado = 'V';
    END

    -- Ejecuta SP de validación para personas
    EXEC spee_validate_person_general_nexus @cramo, @cplan, @femision, @fdesde, @fhasta, @xrif_titular, @fnac_titular;

    -- Lógica de resolución de canal
    IF (@ccanalalt IS NOT NULL)
    BEGIN
        SELECT @ctipocanal = ctipocanal FROM macanalalt WHERE ccanalalt = @ccanalalt;
        SELECT @cgestor = cgestor FROM magestor WHERE ccanalalt = @ccanalalt AND cscanalalt = @cscanalalt;
    END
    ELSE
    BEGIN
        SELECT @cgestor = cgestor, @ctipocanal = ctipocanal, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt 
        FROM magestor 
        WHERE cgestor = CAST(@cproductor AS VARCHAR(30));

        IF (@ctipocanal IS NULL)
        BEGIN
            IF (@cproductor = 80080)
                SET @ctipocanal = 'D';
            ELSE
                SET @ctipocanal = 'T';
        END
    END

    IF (@cproductor = 80080 OR @cproductor IS NULL)
    BEGIN
        SET @ctipocanal = 'D';
    END

    -- Asignación de sucursal según canal o productor
    IF @ccanalalt is not null 
    BEGIN
        SELECT @csucur = COALESCE(csucur,1) from macanalalt where ccanalalt = @ccanalalt;
    END 
    ELSE 
    BEGIN
        SELECT @csucur = COALESCE(csucur,1) from maproduc where cproductor = @cproductor;
    END

    -- Definir tipo de contador de póliza según ramo
    IF (@cramo = 1)  SELECT @POL_RAMO = 'POL_VIDA';
    IF (@cramo = 5)  SELECT @POL_RAMO = 'POL_ACC';
    IF (@cramo = 7)  SELECT @POL_RAMO = 'POL_SALUD';
    IF (@cramo = 9)  SELECT @POL_RAMO = 'POL_FUN';
    IF (@cramo > 9)  SELECT @POL_RAMO = 'POLIZA';
	
    -- Generar IDs y números correlativos llamando al contador de Nexus
    EXEC sp_contador_nexus 
        @cpoliza OUTPUT, 
        @cnpoliza OUTPUT, 
        @crecibo OUTPUT, 
        @cnrecibo OUTPUT, 
        @cproces OUTPUT, 
        @csucur, 
        @fdesde, 
        @cramo, 
        @POL_RAMO;

    -- Si la póliza no fue asignada externamente, generar número amigable leyendo el contador ya incrementado
    IF @cnpoliza IS NULL
    BEGIN
        SELECT @qcontador = qcontador FROM macontadores WHERE ccontador = @POL_RAMO;
        SET @cnpoliza = CONVERT(VARCHAR, @cramo) + '-' + CONVERT(VARCHAR, @csucur) + '-' + FORMAT(@qcontador, '0000000000');
    END;

    SET @iestado = 1;
    SET @xestado = 'PENDING';
    SET @xlog = null;

    -- [personas-profesion 30-oct-2026] Titular = tomador: hereda lo que no venga.
    IF (@xrif_titular IS NULL OR @xrif_titular = @xrif_tomador)
    BEGIN
        SET @cprofesion_titular = COALESCE(@cprofesion_titular, @cprofesion_tomador);
        SET @cocupacion_titular = COALESCE(@cocupacion_titular, @cocupacion_tomador);
        SET @cactividad_titular = COALESCE(@cactividad_titular, @cactividad_tomador);
    END

    -- Insertar en la tabla de pre-emisión de personas general
    INSERT INTO TMEMISION_PERSONAS_GENERAL (
        cnpoliza_rel, cplan, cramo, xcanal_venta, icedula_tomador,
        xrif_tomador, xnombre_tomador, xapellido_tomador, isexo_tomador, iestado_civil_tomador, fnac_tomador, cestado_tomador,
        cciudad_tomador, xdireccion_tomador, xtelefono_tomador, xcorreo_tomador, icedula_titular, xrif_titular, xnombre_titular,
        xapellido_titular, isexo_titular, iestado_civil_titular, fnac_titular, cestado_titular, cciudad_titular,
        xdireccion_titular, xtelefono_titular, xcorreo_titular, 
        cpersona_politica, cterm_y_cod, cdiagnos_enferm, xdiagnos_enferm,
        cproductor, ptasamon, msumaaseg, mprimaext, ifrecuencia, femision, fdesde, fhasta,
        corigen_rel, api, method, cprog,
        ifuente, fingreso, cpoliza, cnpoliza, cproces, ccanalalt, cscanalalt, ctipocanal, iestado, xestado, xlog, cusuario,
        cprofesion_tomador, cocupacion_tomador, cactividad_tomador,
        cprofesion_titular, cocupacion_titular, cactividad_titular -- [personas-profesion 30-oct-2026]
    )
    VALUES (
        @cnpoliza_rel, @cplan, @cramo, @xcanal_venta, @icedula_tomador,
        @xrif_tomador, @xnombre_tomador, @xapellido_tomador, @isexo_tomador, @iestado_civil_tomador, @fnac_tomador, @cestado_tomador,
        @cciudad_tomador, @xdireccion_tomador, @xtelefono_tomador, @xcorreo_tomador, @icedula_titular, @xrif_titular, @xnombre_titular,
        @xapellido_titular, @isexo_titular, @iestado_civil_titular, @fnac_titular, @cestado_titular, @cciudad_titular,
        @xdireccion_titular, @xtelefono_titular, @xcorreo_titular, 
        @cpersona_politica, @cterm_y_cod, @cdiagnos_enferm, @xdiagnos_enferm,
        @cproductor, @ptasamon, @msumaaseg, @mprimaext, @ifrecuencia, @femision, @fdesde, @fhasta,
        @corigen_rel, @api, @method, @cprog, 
        @ifuente, @fingreso, @cpoliza, @cnpoliza, @cproces, @ccanalalt, @cscanalalt, @ctipocanal, @iestado, @xestado, @xlog, @cusuario,
        @cprofesion_tomador, @cocupacion_tomador, @cactividad_tomador,
        @cprofesion_titular, @cocupacion_titular, @cactividad_titular
    );

    SET @id = SCOPE_IDENTITY();

    -- Asegurar inserción de asegurados si es JSON válido
    IF (@asegurados IS NOT NULL AND ISJSON(@asegurados) = 1)
    BEGIN
        INSERT INTO TMEMISION_PERSONAS_GENERAL_ASEG (
            id, nasegurado, cnpoliza, cramo, cplan, icedula_asegurado, xrif_asegurado, xnombre_asegurado,
            xapellido_asegurado, isexo_asegurado, iestado_civil_asegurado, fnac_asegurado, cestado_asegurado,
            cciudad_asegurado, xdireccion_asegurado, xtelefono_asegurado, xcorreo_asegurado, nparentesco_asegurado,
            npeso_asegurado, nestatura_asegurado, precargo, pdescuento,
            cprofesion, cocupacion, cactividad -- [personas-profesion 30-oct-2026]
        )
        SELECT
            @id,
            ROW_NUMBER() OVER (ORDER BY TRY_CONVERT(INT, j.[key]), j.[key]),
            @cnpoliza,
            @cramo,
            @cplan,
            a.tipo_cedula_asegurado,
            a.rif_asegurado,
            a.nombre_asegurado,
            a.apellido_asegurado,
            a.sexo_asegurado,
            a.estado_civil_asegurado,
            a.fnac_asegurado,
            a.estado_asegurado,
            a.ciudad_asegurado,
            a.direccion_asegurado,
            a.telefono_asegurado,
            a.correo_asegurado,
            a.nparentesco_asegurado,
            a.npeso_asegurado,
            a.nestatura_asegurado,
            COALESCE(a.precargo, 0),
            COALESCE(a.pdescuento, 0),
            a.cprofesion_asegurado,
            a.cocupacion_asegurado,
            a.cactividad_asegurado
        FROM OPENJSON(
            CASE
                WHEN LEFT(LTRIM(@asegurados), 1) = '[' THEN @asegurados
                ELSE CONCAT('[', @asegurados, ']')
            END
        ) j
        CROSS APPLY OPENJSON(j.value)
        WITH (
            tipo_cedula_asegurado char(1) '$.tipo_cedula_asegurado',
            rif_asegurado numeric(11,0) '$.rif_asegurado',
            nombre_asegurado varchar(250) '$.nombre_asegurado',
            apellido_asegurado varchar(250) '$.apellido_asegurado',
            sexo_asegurado char(1) '$.sexo_asegurado',
            estado_civil_asegurado char(1) '$.estado_civil_asegurado',
            fnac_asegurado date '$.fnac_asegurado',
            estado_asegurado INT '$.estado_asegurado',
            ciudad_asegurado INT '$.ciudad_asegurado',
            direccion_asegurado varchar(1000) '$.direccion_asegurado',
            telefono_asegurado varchar(250) '$.telefono_asegurado',
            correo_asegurado varchar(250) '$.correo_asegurado',
            nparentesco_asegurado varchar(250) '$.nparentesco_asegurado',
            npeso_asegurado numeric(6,2) '$.npeso_asegurado',
            nestatura_asegurado numeric(8,2) '$.nestatura_asegurado',
            precargo numeric(13,2) '$.precargo',
            pdescuento numeric(13,2) '$.pdescuento',
            cprofesion_asegurado SMALLINT '$.cprofesion_asegurado',
            cocupacion_asegurado SMALLINT '$.cocupacion_asegurado',
            cactividad_asegurado NUMERIC(18,0) '$.cactividad_asegurado'
        ) a;

        -- [personas-profesion 30-oct-2026] La fila del titular hereda lo que no traiga el JSON.
        UPDATE TMEMISION_PERSONAS_GENERAL_ASEG
        SET cprofesion = COALESCE(cprofesion, @cprofesion_titular),
            cocupacion = COALESCE(cocupacion, @cocupacion_titular),
            cactividad = COALESCE(cactividad, @cactividad_titular)
        WHERE id = @id AND xrif_asegurado = @xrif_titular
          AND (@cprofesion_titular IS NOT NULL OR @cocupacion_titular IS NOT NULL OR @cactividad_titular IS NOT NULL);
    END

    -- % de recargo / descuento del titular (parámetros nuevos). Sin parámetros: queda lo del JSON o 0.
    IF (@precargo_titular IS NOT NULL OR @pdescuento_titular IS NOT NULL)
    BEGIN
        UPDATE TMEMISION_PERSONAS_GENERAL_ASEG
        SET precargo = COALESCE(@precargo_titular, precargo, 0),
            pdescuento = COALESCE(@pdescuento_titular, pdescuento, 0)
        WHERE id = @id AND xrif_asegurado = @xrif_titular;

        -- El titular no vino en @asegurados: se agrega con los datos de la cabecera para
        -- que la emisión le aplique su %. Solo si el % es distinto de 0 (no altera lo de hoy).
        IF @@ROWCOUNT = 0
           AND (COALESCE(@precargo_titular, 0) <> 0 OR COALESCE(@pdescuento_titular, 0) <> 0)
        BEGIN
            INSERT INTO TMEMISION_PERSONAS_GENERAL_ASEG (
                id, nasegurado, cnpoliza, cramo, cplan, icedula_asegurado, xrif_asegurado, xnombre_asegurado,
                xapellido_asegurado, isexo_asegurado, iestado_civil_asegurado, fnac_asegurado, cestado_asegurado,
                cciudad_asegurado, xdireccion_asegurado, xtelefono_asegurado, xcorreo_asegurado, nparentesco_asegurado,
                precargo, pdescuento,
                cprofesion, cocupacion, cactividad -- [personas-profesion 30-oct-2026]
            )
            SELECT
                @id,
                COALESCE((SELECT MAX(nasegurado) FROM TMEMISION_PERSONAS_GENERAL_ASEG WHERE id = @id), 0) + 1,
                @cnpoliza, @cramo, @cplan, @icedula_titular, @xrif_titular, @xnombre_titular,
                @xapellido_titular, @isexo_titular, @iestado_civil_titular, @fnac_titular, @cestado_titular,
                @cciudad_titular, @xdireccion_titular, @xtelefono_titular, @xcorreo_titular, 1,
                COALESCE(@precargo_titular, 0), COALESCE(@pdescuento_titular, 0),
                @cprofesion_titular, @cocupacion_titular, @cactividad_titular;
        END
    END

    -- Asegurar inserción de beneficiarios si es JSON válido
    IF (@beneficiarios IS NOT NULL AND ISJSON(@beneficiarios) = 1)
    BEGIN
        INSERT INTO TMEMISION_PERSONAS_GENERAL_BENF (
            id, nbeneficiario, cnpoliza, cramo, cplan, icedula_beneficiario, xrif_beneficiario, xnombre_beneficiario,
            xapellido_beneficiario, isexo_beneficiario, iestado_civil_beneficiario, fnac_beneficiario, cestado_beneficiario,
            cciudad_beneficiario, xdireccion_beneficiario, xtelefono_beneficiario, xcorreo_beneficiario, nparentesco_beneficiario,
            pporce_beneficiario
        )
        SELECT
            @id,
            ROW_NUMBER() OVER (ORDER BY TRY_CONVERT(INT, j.[key]), j.[key]),
            @cnpoliza,
            @cramo,
            @cplan,
            b.tipo_cedula_beneficiario,
            b.rif_beneficiario,
            b.nombre_beneficiario,
            b.apellido_beneficiario,
            b.sexo_beneficiario,
            b.estado_civil_beneficiario,
            b.fnac_beneficiario,
            b.estado_beneficiario,
            b.ciudad_beneficiario,
            b.direccion_beneficiario,
            b.telefono_beneficiario,
            b.correo_beneficiario,
            b.nparentesco_beneficiario,
            b.pporce_beneficiario
        FROM OPENJSON(
            CASE
                WHEN LEFT(LTRIM(@beneficiarios), 1) = '[' THEN @beneficiarios
                ELSE CONCAT('[', @beneficiarios, ']')
            END
        ) j
        CROSS APPLY OPENJSON(j.value)
        WITH (
            tipo_cedula_beneficiario char(1) '$.tipo_cedula_beneficiario',
            rif_beneficiario numeric(11,0) '$.rif_beneficiario',
            nombre_beneficiario varchar(250) '$.nombre_beneficiario',
            apellido_beneficiario varchar(250) '$.apellido_beneficiario',
            sexo_beneficiario char(1) '$.sexo_beneficiario',
            estado_civil_beneficiario char(1) '$.estado_civil_beneficiario',
            fnac_beneficiario date '$.fnac_beneficiario',
            estado_beneficiario INT '$.estado_beneficiario',
            ciudad_beneficiario INT '$.ciudad_beneficiario',
            direccion_beneficiario varchar(1000) '$.direccion_beneficiario',
            telefono_beneficiario varchar(250) '$.telefono_beneficiario',
            correo_beneficiario varchar(250) '$.correo_beneficiario',
            nparentesco_beneficiario varchar(250) '$.nparentesco_beneficiario',
            pporce_beneficiario numeric(13,2) '$.pporce_beneficiario'
        ) b;
    END

    -- Invocar el SP de emisión de personas específico de Nexus con parámetros de salida
    EXEC sp_emision_personas_general_nexus 
        @id = @id,
        @pSuccess = @pSuccess OUTPUT,
        @pErrorMessage = @pErrorMessage OUTPUT;

    -- Propagar error de emisión interna si ocurre
    IF @pSuccess = 0
    BEGIN
        THROW 99001, @pErrorMessage, 1;
    END;

END;

