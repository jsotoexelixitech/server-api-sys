import { Injectable } from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';

export interface ArysEmissionTarget {
  cid: string;
  casegurado: string;
  cpoliza: string | null;
  cnpoliza: string | null;
  xplaca: string | null;
}

export interface ArysPropietaryRow {
  xnombre?: string;
  xapellido?: string;
  fnacimiento?: Date | string;
  ipersona?: string;
  xestado?: string;
  xciudad?: string;
  xavecalle?: string;
  xcorreo?: string;
  xtelefono?: string;
  cliente?: string;
  cci_rif?: string | number;
  cid?: string;
  xprofesion?: string;
  xocupacion?: string;
}

export interface ArysVehiculoRow {
  cpoliza?: string;
  cnpoliza?: string;
  cmarca?: string | number;
  cmodelo?: string | number;
  cversion?: string | number;
  cano?: number;
  xplaca?: string;
  xsercar?: string;
  xsermot?: string;
  xmarca?: string;
  xmodelo?: string;
  xversion?: string;
  xcolor?: string;
  xtransm?: string;
  mvalor?: number;
  npasajero?: number;
}

@Injectable()
export class ArysRepository {
  constructor(private readonly db: MssqlService) {}

  async resolveEmissionTarget(input: {
    cnpoliza?: string;
    cpoliza?: string;
    xplaca?: string;
  }): Promise<ArysEmissionTarget> {
    const cnpoliza = input.cnpoliza?.trim() || null;
    const cpoliza = input.cpoliza?.trim() || null;
    const xplaca = input.xplaca?.trim() || null;

    if (!cnpoliza && !cpoliza && !xplaca) {
      throw new Error('Debe enviar cnpoliza, cpoliza o xplaca para integrar con Arys');
    }

    const req = this.db.request();
    const T = this.db.types;

    let whereClause = '';
    if (cnpoliza) {
      req.input('cnpoliza', T.NVarChar(30), cnpoliza);
      whereClause = 'p.cnpoliza = @cnpoliza';
    } else if (cpoliza) {
      req.input('cpoliza', T.NVarChar(19), cpoliza);
      whereClause = 'p.cpoliza = @cpoliza';
    } else {
      req.input('xplaca', T.VarChar(15), xplaca);
      whereClause = 'v.xplaca = @xplaca';
    }

    const result = await req.query(`
      SELECT TOP 1
        p.cpoliza,
        p.cnpoliza,
        v.xplaca,
        v.casegurado,
        m.cid
      FROM adpoliza p
      INNER JOIN vhcerti v ON v.cnpoliza = p.cnpoliza
      LEFT JOIN maclient m ON m.cci_rif = v.casegurado
      WHERE ${whereClause}
        AND v.casegurado IS NOT NULL
      ORDER BY p.fanopol DESC, p.fmespol DESC
    `);

    const row = result.recordset?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error('No se encontró póliza/vehículo en adpoliza/vhcerti para Arys');
    }

    const cid = String(row.cid ?? '').trim();
    if (!cid) {
      throw new Error(`No se encontró cid en maclient para casegurado ${row.casegurado}`);
    }

    return {
      cid,
      casegurado: String(row.casegurado ?? '').trim(),
      cpoliza: String(row.cpoliza ?? '').trim() || null,
      cnpoliza: String(row.cnpoliza ?? '').trim() || null,
      xplaca: String(row.xplaca ?? '').trim() || null,
    };
  }

  async getPropietaryByCid(cid: string): Promise<ArysPropietaryRow> {
    const raw = cid.trim();
    const digits = raw.replace(/\D/g, '');
    const letterMatch = raw.match(/^([A-Za-z])/);
    const letter = (letterMatch?.[1] ?? 'V').toUpperCase();
    const cidWithLetter = digits ? `${letter}${digits}` : raw.toUpperCase();

    const req = this.db.request();
    const T = this.db.types;
    req.input('cidRaw', T.VarChar(30), raw);
    req.input('cidDigits', T.VarChar(30), digits || raw);
    req.input('cidLetter', T.VarChar(30), cidWithLetter);
    req.input('cciRif', T.VarChar(30), digits || raw);

    const result = await req.query(`
      SELECT TOP 1
        RTRIM(LTRIM(maclient.xnombre_1)) AS xnombre,
        RTRIM(LTRIM(maclient.xapellido_1)) AS xapellido,
        CONVERT(DATE, maclient.fnacimiento) AS fnacimiento,
        maclient.ipersona,
        RTRIM(LTRIM(maestados.xdescripcion_c)) AS xestado,
        TRIM(maciudades.xdescripcion_c) AS xciudad,
        TRIM(maclient_dir.xavecalle) AS xavecalle,
        TRIM(maclient_correo.xcorreo) AS xcorreo,
        TRIM(maclient_tel.xtelefono) AS xtelefono,
        TRIM(maclient.xcliente) AS cliente,
        maclient.cci_rif,
        maclient.cid,
        COALESCE(maprofes.xprofesion, '') AS xprofesion,
        COALESCE(maocupac.xocupacion, '') AS xocupacion
      FROM maclient
      LEFT JOIN maclient_dir ON maclient.cci_rif = maclient_dir.cci_rif
      LEFT JOIN maclient_correo ON maclient.cci_rif = maclient_correo.cci_rif
      LEFT JOIN maestados
        ON maclient_dir.cestado = maestados.cestado
       AND COALESCE(maclient_dir.cpais, 58) = maestados.cpais
      LEFT JOIN maciudades
        ON maclient_dir.cestado = maciudades.cestado
       AND maclient_dir.cciudad = maciudades.cciudad
      LEFT JOIN maclient_tel ON maclient.cci_rif = maclient_tel.cci_rif
      LEFT JOIN maclient_atr ON maclient.cci_rif = maclient_atr.cci_rif
      LEFT JOIN maprofes ON maclient_atr.cprofesion = maprofes.cprofesion
      LEFT JOIN maocupac ON maclient_atr.cocupacion = maocupac.cocupacion
      WHERE LTRIM(RTRIM(CONVERT(VARCHAR(30), maclient.cci_rif))) = @cciRif
         OR LTRIM(RTRIM(CONVERT(VARCHAR(30), maclient.cid))) IN (@cidRaw, @cidDigits, @cidLetter)
         OR LTRIM(RTRIM(CONVERT(VARCHAR(30), maclient.cid))) LIKE '[VEJPGvejpg]' + @cciRif
    `);

    const row = result.recordset?.[0] as ArysPropietaryRow | undefined;
    if (!row) {
      throw new Error(`Cliente no encontrado en maclient para cid ${cid}`);
    }
    return row;
  }

  async getVehiculoByTarget(target: Pick<ArysEmissionTarget, 'cpoliza' | 'cnpoliza' | 'xplaca'>): Promise<ArysVehiculoRow> {
    const req = this.db.request();
    const T = this.db.types;

    let whereClause = '';
    if (target.cnpoliza) {
      req.input('cnpoliza', T.NVarChar(30), target.cnpoliza);
      whereClause = 'p.cnpoliza = @cnpoliza';
    } else if (target.cpoliza) {
      req.input('cpoliza', T.NVarChar(19), target.cpoliza);
      whereClause = 'p.cpoliza = @cpoliza';
    } else if (target.xplaca) {
      req.input('xplaca', T.VarChar(15), target.xplaca);
      whereClause = 'v.xplaca = @xplaca';
    } else {
      throw new Error('No se pudo resolver placa/póliza para vehículo Arys');
    }

    const result = await req.query(`
      SELECT TOP 1
        p.cpoliza,
        p.cnpoliza,
        v.cmarca,
        v.cmodelo,
        v.cversion,
        v.cano,
        v.xplaca,
        v.xsercar,
        v.xsermot,
        m.xmarca,
        m.xmodelo,
        m.xversion,
        v.xcolor,
        LEFT(m.xtransm, 1) AS xtransm,
        m.mvalor,
        m.npasajero
      FROM adpoliza p
      INNER JOIN vhcerti v ON v.cnpoliza = p.cnpoliza
      LEFT JOIN vinma m
        ON m.cmarca = v.cmarca
       AND m.cmodelo = v.cmodelo
       AND m.cversion = v.cversion
       AND m.cano = v.cano
      WHERE ${whereClause}
      ORDER BY p.fanopol DESC, p.fmespol DESC
    `);

    const row = result.recordset?.[0] as ArysVehiculoRow | undefined;
    if (!row) {
      throw new Error('No se encontró vehículo en vhcerti/vinma para Arys');
    }
    return row;
  }
}
