/**
 * CIE-10 / motivo RMS → ccausa Sis2000 (salud).
 * Alineado al mapper de gateway sync; nest resuelve la causa si jws manda 0.
 */
export function mapMotivoToRamo(cdMotivo?: string, cramoPoliza?: number): number {
  if (cramoPoliza && Number.isFinite(cramoPoliza) && cramoPoliza > 0) {
    return Number(cramoPoliza);
  }
  const motivo = String(cdMotivo || '').toUpperCase().trim();
  const mapping: Record<string, number> = {
    APS: 5,
    EMERG: 7,
    CARTA: 5,
    TELE: 5,
    AMDA: 6,
  };
  return mapping[motivo] || 5;
}

export function mapCieToCausa(cie10?: string, ramo: number = 5): number {
  const code = String(cie10 || '').toUpperCase().trim();

  if (ramo === 5) {
    if (code.startsWith('J')) return 14;
    if (code.startsWith('K')) return 5;
    if (code.startsWith('I')) return 5;
    return 13;
  }

  if (ramo === 6) {
    if (code.startsWith('S') || code.startsWith('T')) return 13;
    return 14;
  }

  if (ramo === 7) {
    if (code.startsWith('I2')) return 1001;
    if (
      code.startsWith('I10') ||
      code.startsWith('I11') ||
      code.startsWith('I15')
    ) {
      return 1003;
    }
    if (code.startsWith('I50')) return 1004;
    if (code.startsWith('I6')) return 1005;
    if (code.startsWith('G40') || code.startsWith('R56')) return 1007;
    if (code.startsWith('J45') || code.startsWith('J46')) return 1009;
    if (code.startsWith('J2')) return 1008;
    if (code.startsWith('K35')) return 1015;
    if (code.startsWith('K80') || code.startsWith('K81')) return 1014;
    if (code.startsWith('N20') || code.startsWith('N23')) return 1012;
    if (code.startsWith('R50')) return 1029;
    if (
      code.startsWith('E10') ||
      code.startsWith('E11') ||
      code.startsWith('E14')
    ) {
      return 1035;
    }
    if (code.startsWith('T07')) return 1019;
    if (code.startsWith('S06')) return 1020;
    return 1000;
  }

  return 1;
}

/** Si ccausa viene vacío/0, deriva de CIE + motivo/ramo de la póliza. */
export function resolverCcausa(opts: {
  ccausa?: number;
  cdEnfermedad?: string;
  cdMotivo?: string;
  cramoPoliza?: number;
}): number {
  const given = Number(opts.ccausa ?? 0);
  if (Number.isFinite(given) && given > 0) return given;
  const ramo = mapMotivoToRamo(opts.cdMotivo, opts.cramoPoliza);
  return mapCieToCausa(opts.cdEnfermedad, ramo);
}
