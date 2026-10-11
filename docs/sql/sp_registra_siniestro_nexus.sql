/* 2026-10-11 — Alta de siniestro de Automóvil para el módulo de Siniestros (D14: snsinies es el registro).
 *
 * Envuelve sp_genera_siniestro_nexus y agrega lo que el módulo necesita:
 *  - Idempotencia: si ya se registró el mismo siniestro (póliza + placa + fecha de ocurrencia + causa) devuelve el existente
 *    (@bexistia = 1) en lugar de duplicarlo. Se serializa con un applock para evitar dobles registros simultáneos.
 *  - Moneda de la reserva = moneda de la póliza (D20): el monto llega en la moneda de la póliza; si no es BS se envía como
 *    monto en moneda extranjera y SIS2000 calcula el equivalente en Bs con la tasa del día.
 *  - Tipo de pérdida (D19, catálogo matipoperdida: 1 = PÉRDIDA TOTAL, 2 = PÉRDIDA PARCIAL, 3 = DAÑOS A COSAS): se registra en
 *    sntipoperdida cuando se informa.
 *  - La declaración se acepta con recibos pendientes (D17) y solo en pólizas en curso (D18).
 *
 * Requiere sp_genera_siniestro_nexus. NO invocar contra datos reales sin autorización: crea un siniestro.
 * Prueba segura: ejecutarlo dentro de BEGIN TRAN ... ROLLBACK.
 */
CREATE OR ALTER PROCEDURE [dbo].[sp_registra_siniestro_nexus]
    @cnpoliza VARCHAR(30),
    @placa VARCHAR(50),
    @fnotificacion DATETIME,
    @focurencia DATETIME,
    @ccausa INT,
    @cusuario NUMERIC(11, 0),
    @mmonto NUMERIC(16, 2) = NULL,          -- en la moneda de la póliza
    @ctipoperdida INT = NULL,               -- matipoperdida: 1 total, 2 parcial, 3 daños a cosas
    @cpais INT = 58,
    @cestado INT = 0,
    @cciudad INT = 0,
    @xobserva VARCHAR(254) = NULL,
    @itiposiniestro CHAR(1) = 'R',
    @csinies NUMERIC(19, 0) = NULL OUTPUT,
    @cnsinies CHAR(30) = NULL OUTPUT,
    @bexistia BIT = 0 OUTPUT,
    @cerror INT = 0 OUTPUT,
    @msj VARCHAR(255) = '' OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @cerror = 0;
    SET @msj = '';
    SET @bexistia = 0;
    SET @cnpoliza = LTRIM(RTRIM(@cnpoliza));
    SET @placa = LTRIM(RTRIM(@placa));

    DECLARE @lock INT, @recurso NVARCHAR(200), @cmoneda CHAR(4), @mbs NUMERIC(16, 2), @mext NUMERIC(16, 2);
    DECLARE @msjgen VARCHAR(255), @errgen INT, @csin NUMERIC(19, 0), @cns CHAR(30);

    IF @ctipoperdida IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM matipoperdida WHERE ctipoperdida = @ctipoperdida AND iestado = 'V')
    BEGIN
        SET @cerror = 1;
        SET @msj = 'El tipo de pérdida no existe o no está activo.';
        RETURN;
    END

    SET @recurso = CONCAT('siniestro:', @cnpoliza, '|', @placa, '|', CONVERT(CHAR(8), @focurencia, 112), '|', @ccausa);
    EXEC @lock = sp_getapplock @Resource = @recurso, @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 15000;
    IF @lock < 0
    BEGIN
        SET @cerror = 2;
        SET @msj = 'No se pudo obtener el bloqueo del siniestro; intente de nuevo.';
        RETURN;
    END

    BEGIN TRY
        -- Idempotencia
        SELECT TOP 1 @csinies = t.csinies, @cnsinies = t.cnsinies
        FROM   tmsinies AS t
               INNER JOIN snsinies AS s ON s.csinies = t.csinies AND s.istatsin <> 'A'
        WHERE  LTRIM(RTRIM(t.cnpoliza)) = @cnpoliza
               AND LTRIM(RTRIM(t.asegurado)) = @placa
               AND CONVERT(DATE, t.focurencia) = CONVERT(DATE, @focurencia)
               AND t.ccausa = @ccausa
               AND t.bok = '1'
               AND t.csinies IS NOT NULL
        ORDER BY t.csinies DESC;

        IF @csinies IS NOT NULL
        BEGIN
            SET @bexistia = 1;
            SET @msj = 'El siniestro ya estaba registrado.';
            EXEC sp_releaseapplock @Resource = @recurso, @LockOwner = 'Session';
            RETURN;
        END

        -- Moneda de la póliza en curso (la misma que usa sp_genera_siniestro_nexus)
        SELECT TOP 1 @cmoneda = pol.cmoneda
        FROM   adpoliza AS pol
        WHERE  pol.cnpoliza = @cnpoliza
               AND pol.iestado = 'V'
               AND pol.istatpol = 'V'
               AND CONVERT(DATE, GETDATE()) BETWEEN pol.fdesde AND pol.fhasta
               AND CONVERT(DATE, @focurencia) BETWEEN pol.fdesde AND pol.fhasta
        ORDER BY pol.fanopol DESC, pol.fmespol DESC;

        IF @cmoneda IS NULL
        BEGIN
            SET @cerror = 1;
            SET @msj = 'El asegurado no tiene cobertura, debido a que la póliza se encuentra fuera de vigencia.';
            EXEC sp_releaseapplock @Resource = @recurso, @LockOwner = 'Session';
            RETURN;
        END

        IF @mmonto IS NOT NULL
        BEGIN
            IF RTRIM(@cmoneda) = 'BS' SET @mbs = @mmonto; ELSE SET @mext = @mmonto;
        END

        EXEC sp_genera_siniestro_nexus
            @cnpoliza = @cnpoliza, @fnotificacion = @fnotificacion, @focurencia = @focurencia, @ccausa = @ccausa,
            @asegurado = @placa, @cmoneda = @cmoneda, @cpais = @cpais, @cestado = @cestado, @cciudad = @cciudad,
            @xobserva = @xobserva, @mmontosiniestro = @mbs, @mmontosiniestroext = @mext,
            @itiposiniestro = @itiposiniestro, @cusuario = @cusuario,
            @csinies = @csin OUTPUT, @cnsinies = @cns OUTPUT, @cerror = @errgen OUTPUT, @msj = @msjgen OUTPUT;

        SET @cerror = ISNULL(@errgen, 0);
        SET @msj = ISNULL(@msjgen, '');
        IF @cerror = 0
        BEGIN
            SET @csinies = @csin;
            SET @cnsinies = @cns;
            IF @ctipoperdida IS NOT NULL
            BEGIN
                BEGIN TRY
                    INSERT INTO sntipoperdida (csinies, ctipoperdida, u_version, cnsinies, fingreso, cusuario, ccategoria)
                    VALUES (@csin, @ctipoperdida, 'E', @cns, GETDATE(), @cusuario, 1);
                END TRY
                BEGIN CATCH
                    SET @msj = CONCAT(@msj, ' Advertencia: no se pudo registrar el tipo de pérdida (', ERROR_MESSAGE(), ').');
                END CATCH
            END
        END
    END TRY
    BEGIN CATCH
        SET @cerror = ERROR_NUMBER();
        SET @msj = LEFT(ERROR_MESSAGE(), 255);
    END CATCH

    EXEC sp_releaseapplock @Resource = @recurso, @LockOwner = 'Session';
END
