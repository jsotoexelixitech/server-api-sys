-- =============================================================================
-- Marketplace Nexus: alta de productos que faltaban (Sis2000_QA)
-- Fecha: 2026-10-06 · Solicitado por: Exélixi
--
-- El marketplace de Nexus lista las filas de maproductos con xform "*-nexus" / externo
-- cuyo producto tenga un plan habilitado ('A') en mausuplan para la entidad (P/C) y el
-- item. Este script cubre:
--   25 Viajero             -> falta la fila Exélixi (xform viajero-nexus) en maproductos.
--                             Sus planes (VIAJE1, VIAJE4, ...) ya estan habilitados.
--   51 Combinado Familiar  -> la fila Exélixi ya existe; faltaban habilitar sus 2 planes
--                             (COMBF2 ramo 51 y CMBM1 ramo 9) en mausuplan. Se habilitan
--                             para P/80080 (productor directo, entidad por defecto).
--   79 AP Individual       -> ningun plan tenia cproducto 79: se asocia MAP1 (ramo 49).
-- Idempotente: no duplica filas si se vuelve a correr.
-- =============================================================================
SET NOCOUNT ON;
BEGIN TRAN;

-- 25 Viajero: fila Exélixi (igual que el resto de las filas "-nexus" del 2026-09-23)
IF NOT EXISTS (SELECT 1 FROM maproductos WHERE RTRIM(cproducto) = '25' AND xform = 'viajero-nexus')
    INSERT INTO maproductos
        (cproducto, cramo, u_version, xdescripcion_l, xdescripcion_c, xabreviatura, iproductor, icanal, igestor,
         xform, cprog, ifuente, fingreso, cusuario, ctiporamo, xdescripcion_prod, mmonto_inicial,
         xfraccionamiento, xurl_presentacion)
    VALUES
        ('25', 5, '!', 'Viajero', 'viajero.png', 'viaje', 1, 1, 0,
         'viajero-nexus', 'CreaProd', 'SQL', GETDATE(), 7, 2, 'Seguro de Viaje por días (Nexus).', 'Desde cotización',
         'Por días de viaje', 'https://canva.link/hdkx0bljcf1p4d5');

-- 51 Combinado Familiar: habilitar sus 2 planes para P/80080
INSERT INTO mausuplan (centidad, citem, cramo, cplan, u_version, itipouso)
SELECT 'P', '80080', v.cramo, v.cplan, '!', 'A'
FROM (VALUES (51, 'COMBF2'), (9, 'CMBM1')) v(cramo, cplan)
WHERE NOT EXISTS (
    SELECT 1 FROM mausuplan u
    WHERE u.centidad = 'P' AND u.citem = '80080' AND u.cramo = v.cramo
      AND RTRIM(u.cplan) = v.cplan AND u.itipouso = 'A');

-- 79 AP Individual: maproductos ya tenia la fila nexus (accidentes-individual-nexus), pero ningun
-- plan tenia cproducto = 79. Se asocia MAP1 (ramo 49, ya habilitado 'A' para P/80080). AP (78)
-- conserva MAP2 y los planes del ramo 5.
UPDATE maplanes_per SET cproducto = '79'
WHERE cramo = 49 AND RTRIM(cplan) = 'MAP1' AND RTRIM(cproducto) = '78';

COMMIT TRAN;

-- Reversa:
--   UPDATE maplanes_per SET cproducto = '78' WHERE cramo = 49 AND RTRIM(cplan) = 'MAP1';
--   DELETE FROM mausuplan WHERE centidad='P' AND citem='80080' AND ((cramo=51 AND RTRIM(cplan)='COMBF2') OR (cramo=9 AND RTRIM(cplan)='CMBM1')) AND itipouso='A';
--   DELETE FROM maproductos WHERE RTRIM(cproducto)='25' AND xform='viajero-nexus';
