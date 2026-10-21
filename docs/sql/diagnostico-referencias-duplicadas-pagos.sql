-- Diagnóstico (solo lectura): referencias bancarias reutilizadas en cobros de Pagos Póliza.
-- Sin DDL. No crea ni modifica objetos. Ejecutar en Sis2000_QA y, si hace falta, en producción.
-- Contexto: collection.service.ts rechaza una referencia usada por otro asegurado o por encima del
-- monto del movimiento (assertReferenceNotReused). Estas consultas muestran qué casos ya existen.
-- No se recomienda un índice único sobre cbreporte_pago.xreferencia: hay reutilización legítima
-- (CobroMasiv, CB_PASA) y referencias históricas de otros orígenes que coinciden por azar.

DECLARE @dias INT = 60;   -- misma ventana que COLLECTION_REFERENCE_REUSE_DAYS

-- 1) Referencias usadas en más de un cobro desde Pagos (cprog buildExtPayload*), con asegurados y suma cobrada
--    frente al monto del movimiento en pago_movil.
SELECT p.ref,
       p.cobros, p.asegurados, p.primera, p.ultima,
       p.suma_mpago,
       pm.monto AS monto_movimiento,
       CASE WHEN p.asegurados > 1 THEN 'OTRO_ASEGURADO'
            WHEN pm.monto IS NOT NULL AND p.suma_mpago > pm.monto + 0.01 THEN 'MONTO_EXCEDIDO'
            ELSE 'REVISAR' END AS motivo
FROM (
  SELECT LTRIM(RTRIM(xreferencia)) AS ref,
         COUNT(DISTINCT ctransaccion) AS cobros,
         COUNT(DISTINCT casegurado)   AS asegurados,
         MIN(fingreso) AS primera, MAX(fingreso) AS ultima,
         SUM(mpago) AS suma_mpago
  FROM cbreporte_pago
  WHERE cprog LIKE 'buildExtPayload%' AND LTRIM(RTRIM(xreferencia)) <> ''
  GROUP BY LTRIM(RTRIM(xreferencia))
  HAVING COUNT(DISTINCT ctransaccion) > 1
) p
LEFT JOIN pago_movil pm ON LTRIM(RTRIM(pm.referencia_banco)) = p.ref
ORDER BY p.ultima DESC;

-- 2) Referencias de Pagos que además aparecen en cobros de OTRO asegurado (cualquier origen) dentro de la ventana.
SELECT LTRIM(RTRIM(a.xreferencia)) AS ref, a.casegurado AS asegurado_pagos, b.casegurado AS otro_asegurado,
       b.cprog AS cprog_otro, b.fingreso AS fingreso_otro
FROM cbreporte_pago a
JOIN cbreporte_pago b
  ON LTRIM(RTRIM(b.xreferencia)) = LTRIM(RTRIM(a.xreferencia))
 AND b.ctransaccion <> a.ctransaccion
 AND b.casegurado   <> a.casegurado
WHERE a.cprog LIKE 'buildExtPayload%'
  AND LTRIM(RTRIM(a.xreferencia)) <> ''
  AND a.fingreso >= DATEADD(day, -@dias, GETDATE())
  AND b.fingreso >= DATEADD(day, -@dias, GETDATE());

-- 3) Duplicados en pago_movil (mismo referencia_banco más de una vez).
SELECT LTRIM(RTRIM(referencia_banco)) AS ref, COUNT(*) AS filas, MIN(ifuente) AS ifuente_min, MAX(ifuente) AS ifuente_max
FROM pago_movil
GROUP BY LTRIM(RTRIM(referencia_banco))
HAVING COUNT(*) > 1;

-- 4) Prueba puntual de una referencia: reemplazar el valor. Muestra todos sus cobros.
-- DECLARE @ref VARCHAR(30) = 'REEMPLAZAR';
-- SELECT ctransaccion, casegurado, mpago, cprog, fingreso
-- FROM cbreporte_pago WHERE LTRIM(RTRIM(xreferencia)) = @ref ORDER BY fingreso;
