import { BadRequestException } from '@nestjs/common';
import type {
  AseguradoColectivoDto,
  CreateEmissionColectivoDto,
  TitularColectivoDto,
} from './dto/create-emission-colectivo.dto';

/**
 * Códigos que devuelven sp_pre_emision_personas_colectivo_nexus y sp_emision_personas_colectivo_nexus
 * (docs/sql/emision-colectivo-nexus/README.md). El mensaje del SP empieza por `CODIGO:`.
 */
export const COLECTIVO_ERROR_CODES = [
  'COLECTIVO_PLANTILLA_REQUERIDA',
  'COLECTIVO_PLANTILLA_NO_EXISTE',
  'COLECTIVO_PLANTILLA_SIN_COBERTURAS',
  'COLECTIVO_PLAN_NO_VIGENTE',
  'COLECTIVO_RAMO_NO_COINCIDE',
  'COLECTIVO_RAMO_SIN_CONFIGURAR',
  'COLECTIVO_FECHAS_REQUERIDAS',
  'COLECTIVO_MONEDA_REQUERIDA',
  'COLECTIVO_PRIMA_REQUERIDA',
  'COLECTIVO_TASA_NO_DISPONIBLE',
  'COLECTIVO_TITULARES_REQUERIDOS',
  'COLECTIVO_EDAD_FUERA_DE_RANGO',
  'COLECTIVO_SIN_NUMERO_LIBRE',
  'COLECTIVO_SOLICITUD_NO_EXISTE',
] as const;

/** Validaciones propias de la API (antes de llamar al SP). */
export const COLECTIVO_PERSONA_DUPLICADA = 'COLECTIVO_PERSONA_DUPLICADA';
export const COLECTIVO_FECHAS_INVALIDAS = 'COLECTIVO_FECHAS_INVALIDAS';

export type ColectivoErrorCode =
  | (typeof COLECTIVO_ERROR_CODES)[number]
  | typeof COLECTIVO_PERSONA_DUPLICADA
  | typeof COLECTIVO_FECHAS_INVALIDAS;

export function colectivoBadRequest(code: ColectivoErrorCode, message: string): BadRequestException {
  return new BadRequestException({ success: false, code, message });
}

/** Error del SP con prefijo `COLECTIVO_…:` → 400 con `code`. null si el mensaje no es de negocio. */
export function colectivoErrorFromMessage(msg: string): BadRequestException | null {
  for (const code of COLECTIVO_ERROR_CODES) {
    const at = msg.indexOf(`${code}:`);
    if (at >= 0) {
      const message = msg.slice(at + code.length + 1).trim();
      return colectivoBadRequest(code, message);
    }
  }
  return null;
}

/** Canal emisor resuelto por la API key en maclient_api (spGetMaclientApi). */
export interface CanalEmisorColectivo {
  cproductor: number;
  xcanal_venta: string | null;
  corigen_rel: string | null;
  ifuente: string | null;
  ctipocanal: string | null;
  ccanalalt: number | null;
  cscanalalt: number | null;
}

/** Canal sin registro en maclient_api: productor directo, sin canal alterno. */
export function canalColectivoPorDefecto(cproductor: number): CanalEmisorColectivo {
  return {
    cproductor,
    xcanal_venta: 'Cotizador Colectivo',
    corigen_rel: 'WE',
    ifuente: 'NEXUS',
    ctipocanal: null,
    ccanalalt: null,
    cscanalalt: null,
  };
}

const num = (v: unknown): number | null => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const text = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/** Fila de maclient_api → canal. Solo los canales T/A/D llevan canal alterno (igual que SysIP). */
export function canalColectivoDesdeFila(fila: Record<string, unknown>, cproductorDefecto: number): CanalEmisorColectivo {
  const ctipocanal = text(fila['ctipocanal']);
  const conCanalAlterno = ctipocanal != null && ['T', 'A', 'D'].includes(ctipocanal.toUpperCase());
  return {
    cproductor: num(fila['cproductor']) ?? cproductorDefecto,
    xcanal_venta: text(fila['xcanal_venta']),
    corigen_rel: text(fila['corigen_rel']),
    ifuente: text(fila['ifuente_api']) ?? 'NEXUS',
    ctipocanal: conCanalAlterno ? ctipocanal : null,
    ccanalalt: conCanalAlterno ? num(fila['ccanalalt']) : null,
    cscanalalt: conCanalAlterno ? num(fila['cscanalalt']) : null,
  };
}

/**
 * La misma persona no puede aparecer dos veces en la nómina: el SP registra cada cédula una sola vez en peasegurados
 * y repartiría la prima entre menos personas de las que hay en el certificado.
 */
export function assertNominaSinDuplicados(titulares: TitularColectivoDto[]): void {
  const vistos = new Map<number, string>();
  titulares.forEach((t, i) => {
    const personas: Array<{ rif: number; donde: string }> = [
      { rif: t.rif_titular, donde: `titular ${i + 1}` },
      ...(t.asegurados ?? []).map((a, j) => ({ rif: a.rif_asegurado, donde: `carga ${j + 1} del titular ${i + 1}` })),
    ];
    for (const p of personas) {
      const previo = vistos.get(p.rif);
      if (previo) {
        throw colectivoBadRequest(
          COLECTIVO_PERSONA_DUPLICADA,
          `La cédula ${p.rif} está repetida en la nómina (${previo} y ${p.donde}).`,
        );
      }
      vistos.set(p.rif, p.donde);
    }
  });
}

/** fhasta posterior a fdesde. Las fechas ya vienen validadas como ISO por el DTO. */
export function assertVigenciaColectivo(fdesde: string, fhasta: string): void {
  if (fhasta.slice(0, 10) <= fdesde.slice(0, 10)) {
    throw colectivoBadRequest(COLECTIVO_FECHAS_INVALIDAS, 'fhasta debe ser posterior a fdesde.');
  }
}

const fecha = (v: string | null | undefined): string | null => (v ? String(v).slice(0, 10) : null);

function aseguradoParaSp(a: AseguradoColectivoDto) {
  return {
    icedula_asegurado: a.icedula_asegurado ?? a.tipo_cedula_asegurado ?? 'V',
    rif_asegurado: a.rif_asegurado,
    nombre_asegurado: a.nombre_asegurado,
    apellido_asegurado: a.apellido_asegurado ?? null,
    sexo_asegurado: a.sexo_asegurado,
    estado_civil_asegurado: a.estado_civil_asegurado ?? null,
    fnac_asegurado: fecha(a.fnac_asegurado),
    estado_asegurado: a.estado_asegurado ?? null,
    ciudad_asegurado: a.ciudad_asegurado ?? null,
    direccion_asegurado: a.direccion_asegurado ?? null,
    telefono_asegurado: a.telefono_asegurado ?? null,
    correo_asegurado: a.correo_asegurado ?? null,
    nparentesco_asegurado: a.nparentesco_asegurado,
  };
}

/** JSON @titulares con los nombres que lee el SP (OPENJSON … WITH '$.icedula_titular', etc.). */
export function titularesParaSp(titulares: TitularColectivoDto[]): string {
  return JSON.stringify(
    titulares.map((t) => ({
      icedula_titular: t.icedula_titular ?? t.tipo_cedula_titular ?? 'V',
      rif_titular: t.rif_titular,
      nombre_titular: t.nombre_titular,
      apellido_titular: t.apellido_titular ?? null,
      sexo_titular: t.sexo_titular,
      estado_civil_titular: t.estado_civil_titular ?? null,
      fnac_titular: fecha(t.fnac_titular),
      estado_titular: t.estado_titular ?? null,
      ciudad_titular: t.ciudad_titular ?? null,
      direccion_titular: t.direccion_titular ?? null,
      telefono_titular: t.telefono_titular ?? null,
      correo_titular: t.correo_titular ?? null,
      asegurados: (t.asegurados ?? []).map(aseguradoParaSp),
    })),
  );
}

/** Origen de las filas en Sis2000 (adpoliza.cprog, char 20). */
export const CPROG_COLECTIVO = 'NEXUS_COLECTIVO';

/** Valores de los parámetros de sp_pre_emision_personas_colectivo_nexus (los tipos los pone el servicio). */
export interface ValoresSpColectivo {
  cpoliza_plantilla: string;
  cnpoliza_plantilla: string;
  cplan: string;
  cramo: number;
  xcanal_venta: string | null;
  icedula_tomador: string;
  xrif_tomador: number;
  xnombre_tomador: string;
  xapellido_tomador: string | null;
  isexo_tomador: string | null;
  iestado_civil_tomador: string | null;
  fnac_tomador: string | null;
  cestado_tomador: string | null;
  cciudad_tomador: string | null;
  xdireccion_tomador: string | null;
  xtelefono_tomador: string | null;
  xcorreo_tomador: string | null;
  icedula_titular: string;
  xrif_titular: number;
  xnombre_titular: string;
  xapellido_titular: string | null;
  isexo_titular: string | null;
  iestado_civil_titular: string | null;
  cestado_titular: string | null;
  cciudad_titular: string | null;
  xdireccion_titular: string | null;
  xtelefono_titular: string | null;
  xcorreo_titular: string | null;
  cpersona_politica: string | null;
  cterm_y_cod: string | null;
  cdiagnos_enferm: string | null;
  xdiagnos_enferm: string | null;
  cproductor: number;
  cmoneda: string;
  msumaaseg: number | null;
  mprimaext: number;
  ifrecuencia: string;
  femision: string;
  fdesde: string;
  fhasta: string;
  corigen_rel: string | null;
  api: string;
  method: string;
  cprog: string;
  ifuente: string | null;
  ccanalalt: number | null;
  cscanalalt: number | null;
  ctipocanal: string | null;
  titulares: string;
}

const flag = (v: number | undefined): string | null => (v == null ? null : String(v));
const codigo = (v: number | undefined): string | null => (v == null ? null : String(v));

/**
 * Body del cotizador → parámetros del SP. La empresa es tomador y titular de la póliza; si los escalares del titular
 * no vienen, se toman del tomador (igual que SysIP).
 */
export function valoresSpColectivo(dto: CreateEmissionColectivoDto, canal: CanalEmisorColectivo): ValoresSpColectivo {
  return {
    cpoliza_plantilla: dto.cpoliza_plantilla,
    cnpoliza_plantilla: dto.cnpoliza_plantilla,
    cplan: dto.plan,
    cramo: dto.cramo,
    xcanal_venta: canal.xcanal_venta,
    icedula_tomador: dto.tipo_cedula_tomador,
    xrif_tomador: dto.rif_tomador,
    xnombre_tomador: dto.nombre_tomador,
    xapellido_tomador: dto.apellido_tomador ?? null,
    isexo_tomador: dto.sexo_tomador ?? null,
    iestado_civil_tomador: dto.estado_civil_tomador ?? null,
    fnac_tomador: fecha(dto.fnac_tomador ?? null),
    cestado_tomador: codigo(dto.estado_tomador),
    cciudad_tomador: codigo(dto.ciudad_tomador),
    xdireccion_tomador: dto.direccion_tomador ?? null,
    xtelefono_tomador: dto.telefono_tomador ?? null,
    xcorreo_tomador: dto.correo_tomador ?? null,
    icedula_titular: dto.tipo_cedula_titular ?? dto.tipo_cedula_tomador,
    xrif_titular: dto.rif_titular ?? dto.rif_tomador,
    xnombre_titular: dto.nombre_titular ?? dto.nombre_tomador,
    xapellido_titular: dto.apellido_titular ?? dto.apellido_tomador ?? null,
    isexo_titular: dto.sexo_titular ?? dto.sexo_tomador ?? null,
    iestado_civil_titular: dto.estado_civil_titular ?? dto.estado_civil_tomador ?? null,
    cestado_titular: codigo(dto.estado_tomador),
    cciudad_titular: codigo(dto.ciudad_tomador),
    xdireccion_titular: dto.direccion_tomador ?? null,
    xtelefono_titular: dto.telefono_tomador ?? null,
    xcorreo_titular: dto.correo_tomador ?? null,
    cpersona_politica: flag(dto.dec_persona_politica),
    cterm_y_cod: flag(dto.dec_term_y_cod),
    cdiagnos_enferm: flag(dto.dec_diagnos_enferm),
    xdiagnos_enferm: dto.dec_descrip_enferm ?? null,
    cproductor: canal.cproductor,
    cmoneda: dto.cmoneda,
    msumaaseg: dto.msumaaseg ?? null,
    mprimaext: dto.prima,
    ifrecuencia: dto.frecuencia,
    femision: dto.fecha_emision.slice(0, 10),
    fdesde: dto.fdesde.slice(0, 10),
    fhasta: dto.fhasta.slice(0, 10),
    corigen_rel: canal.corigen_rel,
    api: 'EmisionColectivo',
    method: 'createEmissionColectivo',
    cprog: CPROG_COLECTIVO,
    ifuente: canal.ifuente,
    ccanalalt: canal.ccanalalt,
    cscanalalt: canal.cscanalalt,
    ctipocanal: canal.ctipocanal,
    titulares: titularesParaSp(dto.titulares),
  };
}

/** Fila que devuelve sp_emision_personas_colectivo_nexus al final (primer recibo de la póliza). */
export interface FilaEmisionColectivo {
  cpoliza: string;
  cnpoliza: string;
  cnrecibo: string;
  cproces: number | null;
  fanopol: number;
  fmespol: number;
}

/** Último recordset con cnpoliza (la emisión va anidada dentro de la pre-emisión). null si no hay. */
export function filaEmisionColectivo(result: {
  recordset?: Record<string, unknown>[];
  recordsets?: Record<string, unknown>[][] | Record<string, Record<string, unknown>[]>;
}): FilaEmisionColectivo | null {
  const sets = Array.isArray(result.recordsets) ? result.recordsets : [];
  const candidatos = [...sets].reverse().concat(result.recordset ? [result.recordset] : []);
  for (const rs of candidatos) {
    const fila = rs?.[0];
    if (fila && text(fila['cnpoliza'])) {
      return {
        cpoliza: String(fila['cpoliza'] ?? '').trim(),
        cnpoliza: String(fila['cnpoliza']).trim(),
        cnrecibo: String(fila['cnrecibo'] ?? '').trim(),
        cproces: num(fila['cproces']),
        fanopol: Number(fila['fanopol']),
        fmespol: Number(fila['fmespol']),
      };
    }
  }
  return null;
}
