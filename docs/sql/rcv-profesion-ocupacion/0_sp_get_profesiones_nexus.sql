/*
  Catálogo de profesiones (maprofes)
  Campo Profesión del tomador (maclient_atr.cprofesion). La ocupación sale de sp_get_ocupaciones_nexus (maocupac).
  Circular SAA-02-1079-2026 / valrep Nexus
*/
CREATE OR ALTER PROCEDURE dbo.sp_get_profesiones_nexus
    @iestado CHAR(1) = 'V'  -- NULL = todas; 'V' = vigentes
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        cprofesion,
        RTRIM(xprofesion) AS xprofesion,
        iestado
    FROM dbo.maprofes
    WHERE (@iestado IS NULL OR iestado = @iestado)
    ORDER BY xprofesion;
END;
GO
