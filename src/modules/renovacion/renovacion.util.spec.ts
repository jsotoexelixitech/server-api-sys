import {
  addYearsIso,
  describirEstado,
  evaluarElegibilidad,
  filtrarPorPeriodo,
  mapPersona,
  mapPlanDisponible,
  mapVehiculo,
  parseDiasEnv,
  resolverCanal,
  sugerirVigencia,
} from './renovacion.util';

describe('evaluarElegibilidad', () => {
  const base = { fhasta: '2026-12-01', anulada: false, diasAntes: 30, diasDespues: 30 };

  it('es elegible dentro de la ventana (antes del vencimiento)', () => {
    const r = evaluarElegibilidad({ ...base, hoy: '2026-11-15' });
    expect(r.elegible).toBe(true);
    expect(r.motivo).toBe('ELEGIBLE');
    expect(r.ventana).toEqual({ desde: '2026-11-01', hasta: '2026-12-31', dias_antes: 30, dias_despues: 30 });
    expect(r.dias_para_vencer).toBe(16);
  });

  it('los bordes de la ventana son inclusivos', () => {
    expect(evaluarElegibilidad({ ...base, hoy: '2026-11-01' }).elegible).toBe(true);
    expect(evaluarElegibilidad({ ...base, hoy: '2026-12-31' }).elegible).toBe(true);
  });

  it('antes de la ventana no es elegible', () => {
    const r = evaluarElegibilidad({ ...base, hoy: '2026-10-31' });
    expect(r).toMatchObject({ elegible: false, motivo: 'ANTES_DE_VENTANA' });
  });

  it('vencida hace más de N días no es elegible', () => {
    const r = evaluarElegibilidad({ ...base, hoy: '2027-01-01' });
    expect(r).toMatchObject({ elegible: false, motivo: 'FUERA_DE_VENTANA' });
    expect(r.dias_para_vencer).toBe(-31);
  });

  it('anulada gana sobre todo', () => {
    const r = evaluarElegibilidad({ ...base, hoy: '2026-11-15', anulada: true, renovadaPor: '18-1-1' });
    expect(r.motivo).toBe('ANULADA');
  });

  it('ya renovada (póliza nueva enlazada) no es elegible', () => {
    const r = evaluarElegibilidad({ ...base, hoy: '2026-11-15', renovadaPor: '18-1-0000200000' });
    expect(r).toMatchObject({ elegible: false, motivo: 'YA_RENOVADA' });
    expect(r.mensaje).toContain('18-1-0000200000');
  });

  it('sin fhasta no es elegible', () => {
    expect(evaluarElegibilidad({ ...base, fhasta: null, hoy: '2026-11-15' }).motivo).toBe('SIN_FECHA_HASTA');
  });

  it('respeta la ventana configurable', () => {
    expect(evaluarElegibilidad({ ...base, hoy: '2026-10-01', diasAntes: 61 }).elegible).toBe(true);
  });
});

describe('parseDiasEnv', () => {
  it('usa el default si viene vacío o inválido', () => {
    expect(parseDiasEnv(undefined, 30)).toBe(30);
    expect(parseDiasEnv('', 30)).toBe(30);
    expect(parseDiasEnv('abc', 30)).toBe(30);
    expect(parseDiasEnv('-5', 30)).toBe(30);
  });
  it('lee enteros', () => {
    expect(parseDiasEnv('45', 30)).toBe(45);
    expect(parseDiasEnv(0, 30)).toBe(0);
  });
});

describe('sugerirVigencia', () => {
  it('continuidad: fdesde = fhasta anterior si aún no vence', () => {
    expect(sugerirVigencia('2025-12-01', '2026-12-01', '2026-11-15')).toEqual({
      fdesde_sugerida: '2026-12-01',
      fhasta_sugerida: '2027-12-01',
      continuidad: true,
    });
  });
  it('vencida: fdesde = hoy', () => {
    expect(sugerirVigencia('2025-10-01', '2026-10-01', '2026-10-20')).toEqual({
      fdesde_sugerida: '2026-10-20',
      fhasta_sugerida: '2027-10-20',
      continuidad: false,
    });
  });
  it('vigencia no anual conserva la duración en días', () => {
    expect(sugerirVigencia('2026-11-01', '2026-11-08', '2026-11-05').fhasta_sugerida).toBe('2026-11-15');
  });
  it('29-feb pasa a 28-feb', () => {
    expect(addYearsIso('2028-02-29', 1)).toBe('2029-02-28');
  });
});

describe('resolverCanal', () => {
  it('query manda', () => {
    expect(resolverCanal({ ccanalalt: 5, cproductor: 1 }, { centidad: 'p', citem: '777' })).toEqual({
      centidad: 'P',
      citem: '777',
      origen: 'query',
    });
  });
  it('canal alterno → C', () => {
    expect(resolverCanal({ ccanalalt: ' 12 ', cproductor: 80080 })).toMatchObject({ centidad: 'C', citem: '12' });
  });
  it('sin canal → productor', () => {
    expect(resolverCanal({ ccanalalt: null, cproductor: 80080 })).toMatchObject({ centidad: 'P', citem: '80080' });
  });
  it('sin nada → productor por defecto', () => {
    expect(resolverCanal({}, {}, '99')).toEqual({ centidad: 'P', citem: '99', origen: 'default' });
  });
});

describe('describirEstado', () => {
  it('ANULADA / VENCIDA / VIGENTE', () => {
    expect(describirEstado({ istatpol: 'A' }, '2027-01-01', '2026-11-01')).toBe('ANULADA');
    expect(describirEstado({ istatpol: 'V' }, '2026-10-01', '2026-11-01')).toBe('VENCIDA');
    expect(describirEstado({ istatpol: 'V', iestado: 'V' }, '2027-01-01', '2026-11-01')).toBe('VIGENTE');
  });
});

describe('mapeos', () => {
  it('mapPersona toma contacto y fecha ISO', () => {
    const p = mapPersona({
      cci_rif: 12345678,
      cid: 'V-12345678 ',
      xnombre: ' ANA ',
      xapellido: 'PEREZ',
      isexo: 'F',
      iestado_civil: 'S',
      fnac_iso: '1990-05-04',
      xtelefono_ren: '04141234567',
      xcorreo_ren: 'a@b.com',
      cestado_ren: 1,
      cciudad_ren: 2,
      xdireccion_ren: 'CALLE 1',
    });
    expect(p).toMatchObject({
      cci_rif: '12345678',
      icedula: 'V',
      cid: 'V-12345678',
      xnombre: 'ANA',
      fnacimiento: '1990-05-04',
      xtelefono: '04141234567',
      xcorreo: 'a@b.com',
      cestado: '1',
      cciudad: '2',
      xdireccion: 'CALLE 1',
    });
    expect(mapPersona(undefined)).toBeNull();
  });

  it('mapVehiculo usa las descripciones de mavinma', () => {
    expect(
      mapVehiculo({
        xplaca: 'AB123CD',
        cmarca: '001',
        cmodelo: '002',
        cversion: '003',
        cano: 2015,
        cuso: 1,
        xmarca_ren: 'TOYOTA',
        xmodelo_ren: 'COROLLA',
        xversion_ren: 'XLI',
      }),
    ).toMatchObject({ xplaca: 'AB123CD', xmarca: 'TOYOTA', xmodelo: 'COROLLA', xversion: 'XLI', cano: 2015, cuso: '1' });
    expect(mapVehiculo(null)).toBeNull();
  });

  it('mapPlanDisponible recorta el código', () => {
    expect(mapPlanDisponible({ cramo: 18, cplan: ' RCVBAS ', xplan: 'Plan' })).toMatchObject({
      cramo: 18,
      cplan: 'RCVBAS',
      xplan: 'Plan',
    });
  });

  it('filtrarPorPeriodo deja el periodo de la póliza si existe', () => {
    const rows = [
      { casegurado: 1, fanopol: 2025, fmespol: 10 },
      { casegurado: 2, fanopol: 2026, fmespol: 10 },
    ];
    expect(filtrarPorPeriodo(rows, 2026, 10)).toEqual([rows[1]]);
    expect(filtrarPorPeriodo([{ casegurado: 1 }], 2026, 10)).toHaveLength(1);
  });
});
