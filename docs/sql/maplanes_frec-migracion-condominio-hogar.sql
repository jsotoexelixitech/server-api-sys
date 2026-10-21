-- Migra a maplanes_frec las frecuencias de pago de los planes con los que el portal emite Condominio (ramo 16) y
-- Hogar (ramo 38). Son los planes vigentes de maplanes (iestado = 'V') que devuelve sp_busca_planes_condominio_nexus:
--   ramo 16: 1, 2        ramo 38: 1, 2, 3, 4
-- Frecuencias que ofrecían los portales hasta ahora: A (anual), S (semestral), T (trimestral) y M (mensual).
-- El plan 38/1 ya tiene filas configuradas a mano (A y S) y NO se toca.
-- Idempotente: solo inserta las combinaciones (ramo, plan, frecuencia) que no existan; no hay clave única en la tabla.
-- Se puede ejecutar más de una vez.

SET NOCOUNT ON;

;WITH frecuencias AS (
    SELECT 'A' AS ifrecuencia, 'ANUAL' AS xfrecuencia
    UNION ALL SELECT 'S', 'SEMESTRAL'
    UNION ALL SELECT 'T', 'TRIMESTRAL'
    UNION ALL SELECT 'M', 'MENSUAL'
),
planes AS (
    SELECT p.cramo, p.cplan, p.xplan
    FROM maplanes p
    WHERE p.iestado = 'V'
      AND ((p.cramo = 16 AND RTRIM(p.cplan) IN ('1', '2'))
        OR (p.cramo = 38 AND RTRIM(p.cplan) IN ('2', '3', '4')))
)
INSERT INTO maplanes_frec
    (cramo, cplan, ifrecuencia, u_version, xfrecuencia, xplan, ndias, iestado, cprog, bnacional, fingreso, itipo)
SELECT p.cramo, p.cplan, f.ifrecuencia, '!', f.xfrecuencia, p.xplan, 0, 'V', 'MIGRA_NEXUS', 0, GETDATE(), 'D'
FROM planes p
CROSS JOIN frecuencias f
WHERE NOT EXISTS (
    SELECT 1
    FROM maplanes_frec mf
    WHERE mf.cramo = p.cramo
      AND RTRIM(mf.cplan) = RTRIM(p.cplan)
      AND RTRIM(mf.ifrecuencia) = f.ifrecuencia
);

SELECT cramo, RTRIM(cplan) AS cplan, RTRIM(ifrecuencia) AS ifrecuencia, RTRIM(xfrecuencia) AS xfrecuencia, iestado
FROM maplanes_frec
WHERE cramo IN (16, 38)
ORDER BY cramo, cplan, ifrecuencia;
