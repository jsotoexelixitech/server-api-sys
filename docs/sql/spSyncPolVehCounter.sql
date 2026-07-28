-- Sincroniza macontadores POL_VEH con el máximo cnpoliza (adpóliza + cola TMEMISION).
-- Usado por nest-api antes de pre-emisión RCV (reintento contador).

CREATE OR ALTER PROCEDURE [dbo].[spSyncPolVehCounter]
    @cramo INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @max BIGINT;

    SELECT @max = MAX(TRY_CAST(RIGHT(cnpoliza, 10) AS BIGINT))
    FROM adpoliza
    WHERE cramo = @cramo AND cnpoliza LIKE CAST(@cramo AS VARCHAR) + '-%';

    DECLARE @maxPending BIGINT;
    SELECT @maxPending = MAX(TRY_CAST(RIGHT(cnpoliza, 10) AS BIGINT))
    FROM TMEMISION_AUTOMOVIL_RCV2
    WHERE cramo = @cramo
      AND cnpoliza IS NOT NULL
      AND LTRIM(RTRIM(cnpoliza)) <> ''
      AND cnpoliza LIKE CAST(@cramo AS VARCHAR) + '-%';

    IF @maxPending > ISNULL(@max, 0) SET @max = @maxPending;

    IF @max IS NOT NULL
        UPDATE macontadores SET qcontador = @max WHERE ccontador = 'POL_VEH';

    SELECT ISNULL(qcontador, 0) AS qcontador FROM macontadores WHERE ccontador = 'POL_VEH';
END;
