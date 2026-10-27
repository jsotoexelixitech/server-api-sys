-- sp_contador_nexus: autocorrección del contador de personas (POL_ACC, POL_FUN, POL_SALUD, POL_VIDA)
-- Base de datos: Sis2000. Generado a partir de la definición vigente en Sis2000 (2026-10-27).
-- Causa: spContador_v1 entrega qcontador + 1 sin dejarlo en el contador; al alternar con sp_contador_nexus se repite el cnpoliza
-- (QA: 5-1-1000000912 y 5-1-1000000915). Ver docs/contador-polizas-personas-duplicadas.md.
USE [Sis2000];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
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
        SET @cproces = CONCAT(YEAR(@fdesde), REPLICATE('0',
            CASE
                WHEN (12 - LEN(YEAR(@fdesde)) - LEN(CONVERT(VARCHAR, @q_proces))) > 0
                THEN 12 - LEN(YEAR(@fdesde)) - LEN(CONVERT(VARCHAR, @q_proces))
                ELSE 0
            END
        ) ,@q_proces);

        -- cpoliza
        SET @cpoliza = CONCAT(CAST(@ramo AS NVARCHAR), REPLICATE('0',
            CASE
                WHEN (@lencpoliza - LEN(@ramo) - LEN(CONVERT(VARCHAR, @q_poliza))) > 0
                THEN @lencpoliza - LEN(@ramo) - LEN(CONVERT(VARCHAR, @q_poliza))
                ELSE 0
            END
        ) ,@q_poliza);

        -- cnpoliza
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
GO
