/**
 * Correo de contacto del titular de un vehículo, para el código de un solo uso del portal de siniestros
 * (EXE-70). Devuelve el correo COMPLETO al servicio que consulta (scope `client:read`): quien lo consume
 * es responsable de no mostrarlo entero al usuario final (se enmascara).
 *
 * Orden de fuentes:
 *  1. Correo capturado en la emisión (`eePoliza_Automovil_RCV2.xcorreo_titular`), la fuente con mejor cobertura
 *     (~34 % de las pólizas vigentes frente a 0,2 % de `maclient_correo`).
 *  2. `maclient_correo` del asegurado de la póliza.
 * Todo parametrizado; ambas búsquedas exigen cédula Y placa.
 */
export const PLACA_RE = /^[A-Z0-9]{3,15}$/;

export interface TitularContactoSql {
  sql: string;
  params: { name: string; type: 'varchar' | 'numeric'; length?: number; value: string | number }[];
}

export function normalizarPlacaContacto(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Patrón de correo razonable y descarta direcciones de prueba conocidas. */
const CORREO_VALIDO = (col: string) =>
  `RTRIM(${col}) LIKE '_%@_%._%' AND RTRIM(${col}) NOT LIKE '% %'
     AND RTRIM(${col}) NOT LIKE '%@example.com' AND RTRIM(${col}) NOT LIKE '%@test.com'`;

export function buildCorreoEmisionQuery(placa: string, cciRif: number): TitularContactoSql {
  return {
    sql: `
      SELECT TOP 1 RTRIM(xcorreo_titular) AS correo
      FROM eePoliza_Automovil_RCV2
      WHERE xplaca = @placa
        AND xrif_titular = @cci_rif
        AND ${CORREO_VALIDO('xcorreo_titular')}
      ORDER BY id DESC`,
    params: [
      { name: 'placa', type: 'varchar', length: 15, value: placa },
      { name: 'cci_rif', type: 'numeric', value: cciRif },
    ],
  };
}

/** ¿Existe una póliza de Auto/RCV con esa placa cuyo asegurado o tomador sea la cédula? + correo maestro. */
export function buildPolizaYCorreoMaestroQuery(placa: string, cciRif: number): TitularContactoSql {
  return {
    sql: `
      SELECT TOP 1
        1 AS encontrada,
        (SELECT TOP 1 RTRIM(m.xcorreo)
           FROM maclient_correo m
          WHERE m.cci_rif = v.casegurado AND ${CORREO_VALIDO('m.xcorreo')}) AS correo
      FROM vhcerti v
      INNER JOIN adpoliza p
         ON p.cpoliza = v.cpoliza AND p.fanopol = v.fanopol AND p.fmespol = v.fmespol
      WHERE v.xplaca = @placa
        AND p.cramo IN (18, 26)
        AND (v.casegurado = @cci_rif OR p.ctenedor = @cci_rif)
      ORDER BY p.fhasta DESC`,
    params: [
      { name: 'placa', type: 'varchar', length: 15, value: placa },
      { name: 'cci_rif', type: 'numeric', value: cciRif },
    ],
  };
}
