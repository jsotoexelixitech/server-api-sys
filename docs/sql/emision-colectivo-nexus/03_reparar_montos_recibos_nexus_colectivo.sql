-- =============================================================================================
-- Reparación de datos: recibos de la emisión colectiva por Nexus (cprog NEXUS_COLECTIVO) que
-- salieron con mmontorec/mmontoapag en NULL (antes del arreglo del 18-nov-2026 en el SP 01).
--
-- Efecto visible: cuadro-recibo y recibo con prima 0; el ingreso de caja con "monto cobrado" 0,
-- porque spCobroSis_Ad calcula el pago desde mmontorec/mmontorecext.
--
-- Solo toca filas que siguen en NULL: se puede correr más de una vez. Comisiones: los recibos
-- afectados en QA son del productor 80080 (sin admovcom), así que no hay comisión que regenerar;
-- si aparece uno de otro productor ya cobrado, revisar admovcom aparte.
-- =============================================================================================
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- 1) Montos del recibo (como el escritorio y sp_emision_personas_general_nexus)
UPDATE dbo.adrecibos
SET mmontorec = mprimabruta, mmontorecext = mprimabrutaext,
    mmontoapag = mprimabruta, mmontoapagext = mprimabrutaext,
    pimpuesto = ISNULL(pimpuesto, 0), mimpuesto = ISNULL(mimpuesto, 0), mimpuestoext = ISNULL(mimpuestoext, 0),
    mabono = ISNULL(mabono, 0), mabonoext = ISNULL(mabonoext, 0),
    mpendiente = ISNULL(mpendiente, 0), mpendientext = ISNULL(mpendientext, 0),
    pgastos = ISNULL(pgastos, 0), mgastos = ISNULL(mgastos, 0), mgastosext = ISNULL(mgastosext, 0),
    potrosgas = ISNULL(potrosgas, 0), motrosgas = ISNULL(motrosgas, 0), motrosgasext = ISNULL(motrosgasext, 0),
    potrosrec = ISNULL(potrosrec, 0), motrosrec = ISNULL(motrosrec, 0), motrosrecext = ISNULL(motrosrecext, 0),
    potrosdes = ISNULL(potrosdes, 0), motrosdes = ISNULL(motrosdes, 0), motrosdesext = ISNULL(motrosdesext, 0),
    pgemi = ISNULL(pgemi, 0), mgemi = ISNULL(mgemi, 0), mgemiext = ISNULL(mgemiext, 0),
    pbono = ISNULL(pbono, 0), mbono = ISNULL(mbono, 0), mbonoext = ISNULL(mbonoext, 0),
    iestadoimp = ISNULL(iestadoimp, 'N'), itipocta = ISNULL(itipocta, 'N'), itarjeta = ISNULL(itarjeta, 'N'),
    -- Pagado: solo en los ya cobrados (spCobroSis_Ad lo dejó en NULL); pendientes quedan en 0
    mpagado = CASE WHEN iestadorec = 'C' THEN ROUND(mprimabrutaext * ISNULL(ptasamon_pago, ptasamon), 2) ELSE ISNULL(mpagado, 0) END,
    mpagadoext = CASE WHEN iestadorec = 'C' THEN mprimabrutaext ELSE ISNULL(mpagadoext, 0) END
WHERE cprog = 'NEXUS_COLECTIVO' AND mmontorecext IS NULL;
PRINT CONCAT('adrecibos reparados: ', @@ROWCOUNT);

-- 2) Detalle del cobro (lo que imprime el ingreso de caja)
UPDATE d
SET mmontoapag = d.mprimabruta, mmontoapagext = d.mprimabrutaext,
    mimpuesto = ISNULL(d.mimpuesto, 0), mimpuestoext = ISNULL(d.mimpuestoext, 0),
    mgastos = ISNULL(d.mgastos, 0), mgastosext = ISNULL(d.mgastosext, 0),
    motrosgas = ISNULL(d.motrosgas, 0), motrosgasext = ISNULL(d.motrosgasext, 0),
    motrosrec = ISNULL(d.motrosrec, 0), motrosrecext = ISNULL(d.motrosrecext, 0),
    motrosdes = ISNULL(d.motrosdes, 0), motrosdesext = ISNULL(d.motrosdesext, 0),
    mgemi = ISNULL(d.mgemi, 0), mgemiext = ISNULL(d.mgemiext, 0)
FROM dbo.cbreporte_pago_d d
JOIN dbo.adrecibos a ON a.crecibo = d.crecibo
WHERE a.cprog = 'NEXUS_COLECTIVO' AND d.mmontoapagext IS NULL;
PRINT CONCAT('cbreporte_pago_d reparados: ', @@ROWCOUNT);

COMMIT TRANSACTION;
