export type RolPersonaSync = 'tomador' | 'asegurado' | 'beneficiario';

export type PersonaFoto = {
  cci_rif: string;
  icedula: string;
  xcliente: string;
};

export type FotoPersonas = Record<RolPersonaSync, PersonaFoto>;

export type EstadoDiff =
  | 'OK'
  | 'DISTINTO'
  | 'FALTA_EN_RMS'
  | 'FALTA_EN_SIS'
  | 'FALTA_EN_AMBOS'
  | 'CONFLICTO';

export type OrigenCambio = 'SIS' | 'RMS' | 'AMBOS' | null;

export type DiffCampo = {
  rol: RolPersonaSync;
  campo: 'cci_rif' | 'icedula' | 'xcliente';
  valor_sis: string | null;
  valor_rms: string | null;
  valor_snapshot: string | null;
  estado: EstadoDiff;
  origen_cambio: OrigenCambio;
  detalle: string;
};

const ROLES: RolPersonaSync[] = ['tomador', 'asegurado', 'beneficiario'];
const CAMPOS: Array<DiffCampo['campo']> = ['cci_rif', 'icedula', 'xcliente'];

export function norm(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function emptyFoto(): PersonaFoto {
  return { cci_rif: '', icedula: '', xcliente: '' };
}

export function fotoDesdeSis(row: Record<string, unknown> | null): FotoPersonas {
  const r = row ?? {};
  const one = (
    rif: unknown,
    icedula: unknown,
    cid: unknown,
    nombre: unknown,
  ): PersonaFoto => ({
    cci_rif: String(rif ?? '').replace(/\D/g, ''),
    icedula: String(icedula || cid || 'V')
      .trim()
      .charAt(0)
      .toUpperCase() || 'V',
    xcliente: String(nombre ?? '').replace(/\s+/g, ' ').trim(),
  });
  return {
    tomador: one(
      r['cci_rif_tomador'] ?? r['ctenedor'],
      r['icedula_tomador'],
      r['cid_tomador'],
      r['xtomador'],
    ),
    asegurado: one(
      r['cci_rif_aseg'] ?? r['casegurado'],
      r['icedula_aseg'],
      r['cid_aseg'],
      r['xasegurado'] ?? r['xtitular'],
    ),
    beneficiario: one(
      r['cci_rif_ben'] ?? r['cbeneficiario'],
      r['icedula_ben'],
      r['cid_ben'],
      r['xbeneficiario'],
    ),
  };
}

export function fotoDesdeRms(
  items: Array<Record<string, unknown>>,
  sis: FotoPersonas,
): FotoPersonas {
  const pick = (rif: string, icedula: string): PersonaFoto => {
    const hit = items.find((p) => String(p['cedrif'] ?? '').replace(/\D/g, '') === rif);
    if (!hit) return emptyFoto();
    const nombre =
      String(hit['razonsocial'] || hit['nombreCompleto'] || '')
        .replace(/\s+/g, ' ')
        .trim() ||
      `${hit['nombre'] ?? ''} ${hit['apellido'] ?? ''}`.replace(/\s+/g, ' ').trim();
    return {
      cci_rif: String(hit['cedrif'] ?? '').replace(/\D/g, ''),
      icedula: String(hit['nacionalidad'] || icedula)
        .trim()
        .charAt(0)
        .toUpperCase() || 'V',
      xcliente: nombre,
    };
  };
  return {
    tomador: pick(sis.tomador.cci_rif, sis.tomador.icedula),
    asegurado: pick(sis.asegurado.cci_rif, sis.asegurado.icedula),
    beneficiario: pick(sis.beneficiario.cci_rif, sis.beneficiario.icedula),
  };
}

function clasificaCampo(
  sis: string,
  rms: string,
  snap: string,
): Pick<DiffCampo, 'estado' | 'origen_cambio' | 'detalle'> {
  if (sis === rms && sis) {
    return { estado: 'OK', origen_cambio: null, detalle: 'Homologado' };
  }
  if (!sis && !rms) {
    return {
      estado: 'FALTA_EN_AMBOS',
      origen_cambio: null,
      detalle: 'No hay dato en Sis2000 ni en RMS',
    };
  }
  if (!sis && rms) {
    return {
      estado: 'FALTA_EN_SIS',
      origen_cambio: 'RMS',
      detalle: 'Está en RMS y falta en Sis2000',
    };
  }
  if (sis && !rms) {
    return {
      estado: 'FALTA_EN_RMS',
      origen_cambio: 'SIS',
      detalle: 'Está en Sis2000 y falta en RMS',
    };
  }
  if (snap && sis !== snap && rms !== snap && sis !== rms) {
    return {
      estado: 'CONFLICTO',
      origen_cambio: 'AMBOS',
      detalle: 'Ambos cambiaron respecto al snapshot; no se pisa a ciegas',
    };
  }
  const origen: OrigenCambio =
    snap && sis !== snap && rms === snap
      ? 'SIS'
      : snap && rms !== snap && sis === snap
        ? 'RMS'
        : null;
  return {
    estado: 'DISTINTO',
    origen_cambio: origen,
    detalle: 'Sis2000 y RMS no coinciden',
  };
}

export function diffPersonas(
  sis: FotoPersonas,
  rms: FotoPersonas,
  snapshot?: FotoPersonas | null,
): DiffCampo[] {
  const out: DiffCampo[] = [];
  for (const rol of ROLES) {
    for (const campo of CAMPOS) {
      const vs = campo === 'xcliente' ? norm(sis[rol][campo]) : String(sis[rol][campo] ?? '').trim();
      const vr = campo === 'xcliente' ? norm(rms[rol][campo]) : String(rms[rol][campo] ?? '').trim();
      const vsnap = snapshot
        ? campo === 'xcliente'
          ? norm(snapshot[rol][campo])
          : String(snapshot[rol][campo] ?? '').trim()
        : '';
      const c = clasificaCampo(vs, vr, vsnap);
      out.push({
        rol,
        campo,
        valor_sis: sis[rol][campo] || null,
        valor_rms: rms[rol][campo] || null,
        valor_snapshot: snapshot?.[rol][campo] || null,
        ...c,
      });
    }
  }
  return out;
}

export type DecisionRol = 'SIS_TO_RMS' | 'RMS_TO_SIS' | 'CONFLICTO' | 'NADA';

export function decisionPorRol(diffs: DiffCampo[], rol: RolPersonaSync): DecisionRol {
  const rows = diffs.filter((d) => d.rol === rol);
  if (rows.some((d) => d.estado === 'CONFLICTO')) return 'CONFLICTO';
  const haciaRms = rows.some(
    (d) =>
      d.estado === 'FALTA_EN_RMS' ||
      (d.estado === 'DISTINTO' && d.origen_cambio === 'SIS'),
  );
  const haciaSis = rows.some(
    (d) =>
      d.estado === 'FALTA_EN_SIS' ||
      (d.estado === 'DISTINTO' && d.origen_cambio === 'RMS'),
  );
  if (haciaRms && haciaSis) return 'CONFLICTO';
  if (haciaRms) return 'SIS_TO_RMS';
  if (haciaSis) return 'RMS_TO_SIS';
  const distintoSinOrigen = rows.some(
    (d) => d.estado === 'DISTINTO' && !d.origen_cambio,
  );
  if (distintoSinOrigen) return 'SIS_TO_RMS';
  return 'NADA';
}

export function resumenDiff(diffs: DiffCampo[]): string {
  const count = (estado: EstadoDiff) =>
    diffs.filter((d) => d.estado === estado).length;
  return (
    `OK=${count('OK')} DISTINTO=${count('DISTINTO')} ` +
    `FALTA_EN_RMS=${count('FALTA_EN_RMS')} FALTA_EN_SIS=${count('FALTA_EN_SIS')} ` +
    `CONFLICTO=${count('CONFLICTO')}`
  );
}

export function splitNombre(xcliente: string): { xnombre: string; xapellido: string } {
  const parts = xcliente.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (parts.length <= 1) return { xnombre: xcliente.trim(), xapellido: '' };
  return { xnombre: parts.slice(0, -1).join(' '), xapellido: parts[parts.length - 1] };
}

export function tipoCambioDeRol(rol: RolPersonaSync): 'TOMADOR' | 'ASEGURADO' | 'BENEFICIARIO' {
  if (rol === 'tomador') return 'TOMADOR';
  if (rol === 'beneficiario') return 'BENEFICIARIO';
  return 'ASEGURADO';
}

export function patchDesdeFoto(
  rol: RolPersonaSync,
  foto: PersonaFoto,
): Record<string, unknown> {
  const icedula = foto.icedula || 'V';
  const cid = foto.cci_rif ? `${icedula}-${foto.cci_rif}` : undefined;
  const nombre = foto.xcliente;
  if (rol === 'tomador') {
    return { xtomador: nombre, cid_tomador: cid, icedula_tomador: icedula };
  }
  if (rol === 'beneficiario') {
    return { xbeneficiario: nombre, cid_ben: cid, icedula_ben: icedula };
  }
  return {
    xasegurado: nombre,
    xtitular: nombre,
    cid_aseg: cid,
    icedula_aseg: icedula,
  };
}

export function patchPersonasEndoso(input: {
  tipoCambio: string;
  icedula?: string;
  cci_rif: number | string;
  xcliente: string;
}): Record<string, unknown> {
  const tipo = String(input.tipoCambio ?? '').trim().toUpperCase();
  const icedula = String(input.icedula || 'V').trim().charAt(0) || 'V';
  const cid = `${icedula}-${input.cci_rif}`;
  const nombre = String(input.xcliente ?? '').trim();
  if (tipo === 'TOMADOR') {
    return { xtomador: nombre, cid_tomador: cid, icedula_tomador: icedula };
  }
  if (tipo === 'BENEFICIARIO') {
    return { xbeneficiario: nombre, cid_ben: cid, icedula_ben: icedula };
  }
  return {
    xasegurado: nombre,
    xtitular: nombre,
    cid_aseg: cid,
    icedula_aseg: icedula,
  };
}
