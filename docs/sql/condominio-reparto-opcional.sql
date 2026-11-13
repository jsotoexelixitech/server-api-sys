/*
  Condominio (ramo 16): reparto de la tasa global con coberturas opcionales, límite por cobertura y montos fijos.
  Rama: feat/condominio-reparto-opcional. Requiere condominio-tasas-antiguedad.sql aplicado antes.

  Cambios en dbo.MATARIFA_REPARTO_NEXUS:
    - iopcional: 1 = el cliente puede quitarla y deja de pagar su parte. 0 = va siempre (como hasta hoy).
    - plimite:   límite asegurado de la cobertura, en % de la suma asegurada. NULL = 100 %.
                 La prima de F y P se sigue calculando sobre la suma asegurada completa.
    - itipo 'M': monto fijo anual (pvalor en la moneda de la póliza), fuera de la tasa global.
    - pvalor pasa a NUMERIC(14, 6) para admitir montos fijos.

  Idempotente. No cambia filas existentes: todas quedan iopcional = 0 y plimite = NULL (mismo cálculo de hoy).
  Validar con SET NOEXEC ON / transacción con ROLLBACK antes de aplicar.
*/
SET NOCOUNT ON;

IF COL_LENGTH('dbo.MATARIFA_REPARTO_NEXUS', 'iopcional') IS NULL
    ALTER TABLE dbo.MATARIFA_REPARTO_NEXUS
        ADD iopcional BIT NOT NULL CONSTRAINT DF_MATARIFA_REPARTO_NEXUS_OPCIONAL DEFAULT (0);
GO

IF COL_LENGTH('dbo.MATARIFA_REPARTO_NEXUS', 'plimite') IS NULL
    ALTER TABLE dbo.MATARIFA_REPARTO_NEXUS
        ADD plimite NUMERIC(9, 4) NULL;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.MATARIFA_REPARTO_NEXUS') AND name = 'pvalor' AND precision < 14
)
    ALTER TABLE dbo.MATARIFA_REPARTO_NEXUS ALTER COLUMN pvalor NUMERIC(14, 6) NOT NULL;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_MATARIFA_REPARTO_NEXUS_TIPO')
    ALTER TABLE dbo.MATARIFA_REPARTO_NEXUS DROP CONSTRAINT CK_MATARIFA_REPARTO_NEXUS_TIPO;
GO

ALTER TABLE dbo.MATARIFA_REPARTO_NEXUS
    ADD CONSTRAINT CK_MATARIFA_REPARTO_NEXUS_TIPO CHECK (itipo IN ('F', 'P', 'M'));
GO

-- Dinámico: la columna plimite se crea en el lote anterior.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_MATARIFA_REPARTO_NEXUS_LIMITE')
    EXEC('ALTER TABLE dbo.MATARIFA_REPARTO_NEXUS
            ADD CONSTRAINT CK_MATARIFA_REPARTO_NEXUS_LIMITE CHECK (plimite IS NULL OR (plimite > 0 AND plimite <= 100))');
GO

-- Verificación
SELECT c.name, t.name AS tipo, c.precision, c.scale, c.is_nullable
FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.MATARIFA_REPARTO_NEXUS')
ORDER BY c.column_id;
