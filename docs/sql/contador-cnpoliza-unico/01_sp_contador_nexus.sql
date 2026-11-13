-- [cnpoliza-unico 09-nov-2026] sp_contador_nexus: el cnpoliza entregado no puede existir en adpoliza ni en una
-- pre-emisión pendiente de Nexus; si existe, salta al siguiente número libre y deja el contador ahí.
-- [cproces-unico 13-nov-2026] Además, el cproces entregado no puede existir en sopoliza (ver bloque cproces).
-- Base: definición vigente en Sis2000_QA (modificada 2026-10-27 15:48:37), respaldo en respaldo/.
-- QA del Core desplegado = 192.168.8.80 (modificada 2026-11-06), respaldo en respaldo/sp_contador_nexus.QA80-2026-11-13.sql.
-- Alcance: protege a quien usa el @cnpoliza devuelto (Personas, Condominio). Auto RCV y Flota arman su propio
-- número leyendo macontadores después de la llamada; ver README.md.
-- sp_contador_nexus: autocorrección del contador de personas (POL_ACC, POL_FUN, POL_SALUD, POL_VIDA)
-- Base de datos: sis2000_qa. Generado a partir de la definición vigente en sis2000_qa (2026-10-27).
-- Causa: spContador_v1 entrega qcontador + 1 sin dejarlo en el contador; al alternar con sp_contador_nexus se repite el cnpoliza
-- (QA: 5-1-1000000912 y 5-1-1000000915). Ver docs/contador-polizas-personas-duplicadas.md.

CREATE OR ALTER PROCEDURE [dbo].[sp_contador_nexus]
@cpoliza NUMERIC(19) OUTPUT, @cnpoliza NVARCHAR(17)OUTPUT,
@crecibo NUMERIC(19) OUTPUT, @cnrecibo NVARCHAR(17) OUTPUT,
@cproces NUMERIC(13)OUTPUT, @csucur NUMERIC(4),@fdesde DATE,
@ramo INT, @pol_type VARCHAR(10)
AS
BEGIN
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE
            @lencpoliza  NUMERIC (19) = (SELECT NUMERIC_PRECISION FROM information_schema.COLUMNS WHERE TABLE_NAME = 'adpoliza' and COLUMN_NAME = 'cpoliza'),
            @lencnpoliza  NVARCHAR (14) = 14,
            @lencrecibo NUMERIC (19) = (SELECT NUMERIC_PRECISION FROM information_schema.COLUMNS WHERE TABLE_NAME = 'adrecibos' and COLUMN_NAME = 'crecibo'),
            @lencproces NUMERIC (13) = (SELECT NUMERIC_PRECISION FROM information_schema.COLUMNS WHERE TABLE_NAME = 'adrecibos' and COLUMN_NAME = 'cproces'),
            @q_recibo numeric(16), @q_proces numeric(16), @q_poliza numeric(16), @q_pol_type numeric(16), @q_crecibo numeric(16);

        -- 1. Obtener valores incrementados de macontadores
        UPDATE macontadores WITH (UPDLOCK)
        SET @q_recibo = qcontador = qcontador + 1 WHERE ccontador = 'RECIBO';

        UPDATE macontadores WITH (UPDLOCK)
        SET @q_proces = qcontador = qcontador + 1 WHERE ccontador = 'cproces';

        UPDATE macontadores WITH (UPDLOCK)
        SET @q_poliza = qcontador = qcontador + 1 WHERE ccontador = 'cpoliza';

        UPDATE macontadores WITH (UPDLOCK)
        SET @q_pol_type = qcontador = qcontador + 1 WHERE ccontador = @pol_type;

        UPDATE macontadores WITH (UPDLOCK)
        SET @q_crecibo = qcontador = qcontador + 1 WHERE ccontador = 'CRECIBO';

        -- 2. Consultar máximos reales de las tablas para autocuración
        DECLARE @max_poliza NUMERIC(16), @max_crecibo NUMERIC(16), @max_proces NUMERIC(16), @max_recibo_friendly NUMERIC(16), @max_pol_type NUMERIC(16);

        SELECT @max_poliza = MAX(cpoliza % 1000000000) FROM adpoliza WHERE cpoliza >= 1000000000000000000 AND cramo IN (4, 9, 18, 27);
        SELECT @max_crecibo = MAX(crecibo % 1000000000) FROM adrecibos WHERE crecibo >= 1000000000000000000 AND cramo IN (4, 9, 18, 27);
        SELECT @max_proces = MAX(cproces % 100000000) FROM adpoliza WHERE cproces >= 100000000000 AND cramo IN (4, 9, 18, 27);

        SELECT @max_recibo_friendly = MAX(TRY_CAST(RIGHT(TRIM(cnrecibo), 9) AS NUMERIC(18,0)))
        FROM adrecibos
        WHERE cnrecibo LIKE '%-%' AND crecibo >= 1000000000000000000 AND cramo = @ramo;

        IF @pol_type = 'POL_VEH'
        BEGIN
            SELECT @max_pol_type = MAX(TRY_CAST(RIGHT(TRIM(cnpoliza), 6) AS NUMERIC(18,0)))
            FROM adpoliza
            WHERE cnpoliza LIKE '%-%-%' AND cpoliza >= 1000000000000000000 AND cramo = @ramo;
        END
        ELSE IF @pol_type IN ('POL_ACC', 'POL_FUN', 'POL_SALUD', 'POL_VIDA')
        BEGIN
            -- Personas: los flujos de Sis2000 (spContador_v1) arman el cnpoliza con qcontador + 1 sin dejarlo en el
            -- contador, así que el contador queda uno atrás del último número entregado. Tomar el mayor número ya
            -- usado en el ramo, en pólizas emitidas y en solicitudes de pre-emisión (aún sin adpoliza).
            -- Formato de ambos contadores: <ramo>-<sucursal>-<sucursal><ceros><contador> de @lencnpoliza caracteres,
            -- p. ej. 5-1-1000000915. Otras series del ramo (p. ej. 7-1-100016108, 13 caracteres) no usan este contador.
            SELECT @max_pol_type = MAX(n.numero)
            FROM (
                SELECT RTRIM(cnpoliza) AS cn FROM adpoliza
                WHERE cramo = @ramo AND cnpoliza LIKE CAST(@ramo AS VARCHAR(5)) + '-%-%'
                UNION ALL
                SELECT RTRIM(cnpoliza) FROM TMEMISION_PERSONAS_GENERAL
                WHERE cramo = @ramo AND cnpoliza LIKE CAST(@ramo AS VARCHAR(5)) + '-%-%'
            ) p
            CROSS APPLY (SELECT CHARINDEX('-', p.cn) AS d1) a
            CROSS APPLY (SELECT CHARINDEX('-', p.cn, a.d1 + 1) AS d2) b
            CROSS APPLY (SELECT SUBSTRING(p.cn, a.d1 + 1, b.d2 - a.d1 - 1) AS sucur, SUBSTRING(p.cn, b.d2 + 1, 30) AS resto) s
            CROSS APPLY (SELECT TRY_CAST(CASE WHEN LEN(s.sucur) > 0 AND LEFT(s.resto, LEN(s.sucur)) = s.sucur
                                              THEN STUFF(s.resto, 1, LEN(s.sucur), '') END AS NUMERIC(18,0)) AS numero) n
            -- Ventana de 1000 sobre el contador: cubre el desfase de spContador_v1 y las solicitudes pendientes sin que un
            -- número aislado fuera de serie (p. ej. 7-1-1000008907 en QA) haga saltar todo el contador.
            WHERE LEN(p.cn) = @lencnpoliza AND n.numero <= @q_pol_type + 1000;
        END

        -- 3. Si el máximo de la tabla es mayor o igual que el valor obtenido, curar y usar el máximo + 1
        IF @max_poliza IS NOT NULL AND @max_poliza >= @q_poliza
        BEGIN
            SET @q_poliza = @max_poliza + 1;
            UPDATE macontadores SET qcontador = @q_poliza WHERE ccontador = 'cpoliza';
        END

        IF @max_crecibo IS NOT NULL AND @max_crecibo >= @q_crecibo
        BEGIN
            SET @q_crecibo = @max_crecibo + 1;
            UPDATE macontadores SET qcontador = @q_crecibo WHERE ccontador = 'CRECIBO';
        END

        IF @max_proces IS NOT NULL AND @max_proces >= @q_proces
        BEGIN
            SET @q_proces = @max_proces + 1;
            UPDATE macontadores SET qcontador = @q_proces WHERE ccontador = 'cproces';
        END

        IF @max_recibo_friendly IS NOT NULL AND @max_recibo_friendly >= @q_recibo
        BEGIN
            SET @q_recibo = @max_recibo_friendly + 1;
            UPDATE macontadores SET qcontador = @q_recibo WHERE ccontador = 'RECIBO';
        END

        IF @max_pol_type IS NOT NULL AND @max_pol_type >= @q_pol_type
        BEGIN
            SET @q_pol_type = @max_pol_type + 1;
            UPDATE macontadores SET qcontador = @q_pol_type WHERE ccontador = @pol_type;
        END

        -- 4. Construir salidas
        -- cnrecibo
        SET @cnrecibo = CAST(@ramo AS NVARCHAR) + '-' + CAST(@csucur AS NVARCHAR) + CAST(@q_recibo AS NVARCHAR);

        -- cproces
        -- [cproces-unico 13-nov-2026] La emisión de Auto de Sis2000 escritorio (cprog 'Emi_Auto') graba solicitudes en
        -- sopoliza con un cproces que no deja en macontadores; el contador luego entrega ese mismo número y la emisión
        -- falla con "Violation of PRIMARY KEY constraint 'sopoliza_pk'" (QA .80: 202600309795, Condominio).
        -- Si el número ya existe en sopoliza (PK por cproces), se salta al siguiente y el contador queda ahí.
        DECLARE @cp_saltos INT = 0, @cp_msg NVARCHAR(400);
        WHILE 1 = 1
        BEGIN
            SET @cproces = CONCAT(YEAR(@fdesde), REPLICATE('0',
                CASE
                    WHEN (12 - LEN(YEAR(@fdesde)) - LEN(CONVERT(VARCHAR, @q_proces))) > 0
                    THEN 12 - LEN(YEAR(@fdesde)) - LEN(CONVERT(VARCHAR, @q_proces))
                    ELSE 0
                END
            ) ,@q_proces);

            IF NOT EXISTS (SELECT 1 FROM sopoliza WHERE cproces = @cproces)
                BREAK;

            SET @cp_saltos += 1;
            IF @cp_saltos >= 1000
            BEGIN
                SET @cp_msg = CONCAT(N'CONTADOR_SIN_NUMERO_LIBRE: cproces no encontró un número libre en 1000 intentos (último ', @cproces, N').');
                THROW 99151, @cp_msg, 1;
            END;
            SET @q_proces += 1;
        END;

        IF @cp_saltos > 0
            UPDATE macontadores SET qcontador = @q_proces WHERE ccontador = 'cproces' AND qcontador < @q_proces;

        -- cpoliza
        SET @cpoliza = CONCAT(CAST(@ramo AS NVARCHAR), REPLICATE('0',
            CASE
                WHEN (@lencpoliza - LEN(@ramo) - LEN(CONVERT(VARCHAR, @q_poliza))) > 0
                THEN @lencpoliza - LEN(@ramo) - LEN(CONVERT(VARCHAR, @q_poliza))
                ELSE 0
            END
        ) ,@q_poliza);

        -- cnpoliza
        -- [cnpoliza-unico 09-nov-2026] El número no puede existir ya en una póliza emitida (adpoliza) ni en una
        -- pre-emisión pendiente de Nexus (TMEMISION_PERSONAS_GENERAL, TMEMISION_CONDOMINIO_NEXUS). Si existe, se salta
        -- al siguiente y el contador queda en el número entregado. adpoliza.cnpoliza tiene índice (adpolizaI2).
        DECLARE @cn_saltos INT = 0, @cn_chk VARCHAR(30), @cn_msg NVARCHAR(400);
        WHILE 1 = 1
        BEGIN
            SET @cnpoliza = CONCAT(CAST(@ramo AS NVARCHAR) + '-' +
                CAST(@csucur AS NVARCHAR) + '-' +
                CAST(@csucur AS NVARCHAR) +
                REPLICATE('0',
                CASE
                    WHEN (@lencnpoliza - LEN(@ramo)- len('-') - LEN(@csucur) - len('-') - LEN(@csucur) -LEN(CONVERT(VARCHAR, @q_pol_type))) > 0
                    THEN @lencnpoliza -LEN(@ramo)- len('-') - LEN(@csucur)  -len('-') - LEN(@csucur) -LEN(CONVERT(VARCHAR, @q_pol_type))
                    ELSE 0
                END
                ) ,@q_pol_type);
            SET @cn_chk = @cnpoliza;

            IF NOT EXISTS (SELECT 1 FROM adpoliza WHERE cnpoliza = @cn_chk)
               AND NOT EXISTS (SELECT 1 FROM TMEMISION_PERSONAS_GENERAL WHERE cnpoliza = @cn_chk)
               AND NOT EXISTS (SELECT 1 FROM TMEMISION_CONDOMINIO_NEXUS WHERE cnpoliza = @cn_chk)
                BREAK;

            SET @cn_saltos += 1;
            IF @cn_saltos >= 1000
            BEGIN
                SET @cn_msg = CONCAT(N'CONTADOR_SIN_NUMERO_LIBRE: ', @pol_type, N' no encontró un número de póliza libre en 1000 intentos (último ', @cnpoliza, N').');
                THROW 99150, @cn_msg, 1;
            END;
            SET @q_pol_type += 1;
        END;

        IF @cn_saltos > 0
            UPDATE macontadores SET qcontador = @q_pol_type WHERE ccontador = @pol_type AND qcontador < @q_pol_type;

        -- crecibo
        SET @crecibo = CONCAT(CAST(@ramo AS NVARCHAR), REPLICATE('0',
            CASE
                WHEN (@lencrecibo - LEN(@ramo) - LEN(CONVERT(VARCHAR, @q_crecibo))) > 0
                THEN @lencrecibo - LEN(@ramo) - LEN(CONVERT(VARCHAR, @q_crecibo))
                ELSE 0
            END
        ) ,@q_crecibo);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;