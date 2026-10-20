/**
 * Consultas de catálogos para DGBOSS (solo lectura sobre Sis2000).
 * Alcance: productos del marketplace nuevo = maproductos.xform terminado en "-nexus".
 * Los ramos del catálogo son los de esos productos y los de sus planes (maplanes.cramo).
 */

/** Producto marketplace nuevo (-nexus) y habilitado en algún canal (iproductor, icanal o igestor). */
const NEXUS_ACTIVO_PR = "RTRIM(pr.xform) LIKE '%-nexus' AND (pr.iproductor = 1 OR pr.icanal = 1 OR pr.igestor = 1)";
const NEXUS_ACTIVO = "RTRIM(xform) LIKE '%-nexus' AND (iproductor = 1 OR icanal = 1 OR igestor = 1)";

const NEXUS_RAMOS = `
  SELECT DISTINCT cramo FROM (
    SELECT pr.cramo FROM maproductos pr WHERE ${NEXUS_ACTIVO_PR}
    UNION
    SELECT pl.cramo FROM maplanes pl
      JOIN maproductos pr ON RTRIM(pr.cproducto) = RTRIM(pl.cproducto)
     WHERE ${NEXUS_ACTIVO_PR}
  ) r`;

export const DGBOSS_SQL = {
  lineas: `
    SELECT DISTINCT RTRIM(t.ctiporamo) AS codigo, RTRIM(t.xdescripcion_l) AS descripcion
      FROM matiporamo t
      JOIN maramos r ON RTRIM(r.ctiporamo) = RTRIM(t.ctiporamo)
     WHERE r.cramo IN (${NEXUS_RAMOS})`,
  ramos: `
    SELECT CAST(r.cramo AS varchar(10)) AS codigo, RTRIM(r.xdescripcion_l) AS descripcion,
           RTRIM(r.ctiporamo) AS codigo_linea
      FROM maramos r
     WHERE r.cramo IN (${NEXUS_RAMOS})`,
  // ccobertura no es único entre ramos: el código enviado es "<cramo>-<ccobertura>".
  coberturas: `
    SELECT CAST(c.cramo AS varchar(10)) + '-' + RTRIM(c.ccobertura) AS codigo,
           RTRIM(c.xdescripcion_l) AS descripcion
      FROM macoberturas c
     WHERE c.cramo IN (${NEXUS_RAMOS}) AND RTRIM(c.iestado) = 'V'`,
  moneda: `
    SELECT RTRIM(cmoneda) AS codigo, RTRIM(xdescripcion_l) AS descripcion
      FROM mamonedas WHERE RTRIM(iestado) = 'V'`,
  producto: `
    SELECT RTRIM(cproducto) AS codigo, RTRIM(xdescripcion_l) AS descripcion
      FROM maproductos WHERE ${NEXUS_ACTIVO}`,
  // Códigos de ifrecuencia con su descripción base (la tabla de planes repite la letra con textos por duración).
  frecuencia: `
    SELECT RTRIM(ifrecuencia) AS codigo,
           MIN(CASE WHEN RTRIM(ifrecuencia) = 'A' THEN 'ANUAL' ELSE RTRIM(xfrecuencia) END) AS descripcion
      FROM maplanes_frec
     GROUP BY RTRIM(ifrecuencia)`,
} as const;
