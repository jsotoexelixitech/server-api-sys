import { revisarPlan, type DatosRevision } from './configurador.revision';

const base = (): DatosRevision => ({
  cramo: 18,
  cplan: 'RCV01 ',
  familia: 'auto',
  cabeceras: [{ tabla: 'maplanes', iestado: 'V', cproducto: 'AUT01' }],
  ramosConMismoPlan: [],
  productoExiste: true,
  coberturas: [
    { ccobertura: '1', ctarifa: '1', tarifaExiste: true, detallesV: 1, ccontrea: 6005, cramorea: 102, cob18: 1 },
    { ccobertura: '6', ctarifa: '1', tarifaExiste: true, detallesV: 1, ccontrea: 6005, cramorea: 102, cob18: 6 },
  ],
  aranceles: [{ cplan: '0', ccober: '0', ctarifa: '0', iestado: 'V' }],
  frecuenciasV: ['A', 'S'],
  usuariosPermitidos: 2,
  auto: {
    paresTipoUso: 3,
    paresEnOtrosRamos: [],
    tasasAntiguedad: [
      { ccober: '1', ctarifa: '1', desde: 0, hasta: 5, pprima: 2 },
      { ccober: '1', ctarifa: '1', desde: 6, hasta: 99, pprima: 3 },
    ],
  },
});

const codigos = (r: ReturnType<typeof revisarPlan>, nivel?: string) =>
  r.items.filter((i) => !nivel || i.nivel === nivel).map((i) => i.codigo);

describe('revisarPlan', () => {
  it('plan de auto completo: listo y sin errores', () => {
    const r = revisarPlan(base());
    expect(r.listo).toBe(true);
    expect(r.familia).toBe('auto');
    expect(codigos(r, 'error')).toEqual([]);
    expect(codigos(r, 'ok')).toEqual(expect.arrayContaining(['PLAN_VIGENTE', 'TARIFAS_OK', 'COMISION_OK', 'AUTO_TASAS_OK', 'AUTO_CASCO_OK']));
  });

  it('plan inexistente: un solo error', () => {
    const r = revisarPlan({ ...base(), cabeceras: [] });
    expect(r.listo).toBe(false);
    expect(codigos(r)).toEqual(['PLAN_NO_EXISTE']);
  });

  it('genéricas: plan no vigente, cplan repetido, producto largo e inexistente, tarifas, reaseguro, comisión, frecuencias y canales', () => {
    const d = base();
    d.familia = 'cosas';
    d.auto = undefined;
    d.cabeceras = [{ tabla: 'maplanes', iestado: 'I', cproducto: 'PRODUCTO7' }];
    d.ramosConMismoPlan = [28];
    d.productoExiste = false;
    d.coberturas = [
      { ccobertura: '1', ctarifa: '1', tarifaExiste: false, detallesV: 0, ccontrea: 1, cramorea: 1, cob18: null },
      { ccobertura: '2', ctarifa: '1', tarifaExiste: true, detallesV: 0, ccontrea: null, cramorea: 1, cob18: null },
      { ccobertura: '3', ctarifa: '2', tarifaExiste: true, detallesV: 2, ccontrea: 1, cramorea: 1, cob18: null },
    ];
    d.aranceles = [];
    d.frecuenciasV = ['A', 'X', 'K'];
    d.usuariosPermitidos = 0;
    const r = revisarPlan(d);
    expect(r.listo).toBe(false);
    expect(codigos(r, 'error')).toEqual(expect.arrayContaining([
      'PLAN_NO_VIGENTE', 'PLAN_CODIGO_REPETIDO', 'PRODUCTO_LARGO', 'PRODUCTO_NO_EXISTE', 'TARIFA_NO_EXISTE', 'TARIFA_SIN_DETALLE',
      'TARIFA_DETALLE_DUPLICADO', 'REASEGURO_INCOMPLETO', 'COMISION_FALTA', 'CANALES_FALTAN',
    ]));
    expect(codigos(r, 'aviso')).toEqual(expect.arrayContaining(['FRECUENCIA_DESCONOCIDA', 'FRECUENCIA_K_NO_AUTO']));
    expect(codigos(r).some((c) => c.startsWith('AUTO_'))).toBe(false);
  });

  it('personas: el plan debe estar en maplanes_per', () => {
    const d = { ...base(), familia: 'personas' as const, auto: undefined };
    expect(codigos(revisarPlan(d), 'error')).toContain('PLAN_TABLA_FAMILIA');
    d.cabeceras = [{ tabla: 'maplanes_per', iestado: 'V', cproducto: 'VIDA1' }];
    expect(codigos(revisarPlan(d), 'error')).toEqual([]);
  });

  it('comisiones duplicadas por cobertura o tarifa en el ramo (aunque sean de otro plan)', () => {
    const d = base();
    d.aranceles = [
      { cplan: 'RCV01', ccober: '1', ctarifa: '1', iestado: 'V' },
      { cplan: 'OTRO', ccober: '1', ctarifa: '7', iestado: 'V' },
      { cplan: 'OTRO', ccober: '9', ctarifa: '1', iestado: 'V' },
      { cplan: 'OTRO', ccober: '6', ctarifa: '8', iestado: 'N' },
    ];
    const r = revisarPlan(d);
    expect(codigos(r, 'error')).toEqual(expect.arrayContaining(['COMISION_DUPLICADA_COBERTURA', 'COMISION_DUPLICADA_TARIFA']));
    expect(r.items.find((i) => i.codigo === 'COMISION_DUPLICADA_COBERTURA')?.seccion).toBe('comisiones');
  });

  it('auto: sin casco, sin tipo/uso, pares en otros ramos, huecos y cobertura sin equivalente del 18', () => {
    const d = base();
    d.cramo = 26;
    d.coberturas = [
      { ccobertura: '7', ctarifa: '1', tarifaExiste: true, detallesV: 1, ccontrea: 1, cramorea: 1, cob18: 6 },
      { ccobertura: '28', ctarifa: '1', tarifaExiste: true, detallesV: 1, ccontrea: 1, cramorea: 1, cob18: 28 },
      { ccobertura: '40', ctarifa: '1', tarifaExiste: true, detallesV: 1, ccontrea: 1, cramorea: 1, cob18: null },
    ];
    d.auto = {
      paresTipoUso: 0,
      paresEnOtrosRamos: [{ ctipo: 1, ccategotr: 2, ramos: [18] }],
      tasasAntiguedad: [
        { ccober: '28', ctarifa: '1', desde: 0, hasta: 3, pprima: 1 },
        { ccober: '28', ctarifa: '1', desde: 5, hasta: 9, pprima: 1 },
        { ccober: '7', ctarifa: '1', desde: 0, hasta: 99, pprima: 1 },
      ],
    };
    const r = revisarPlan(d);
    expect(codigos(r, 'error')).toEqual(expect.arrayContaining(['AUTO_SIN_CASCO', 'AUTO_TIPO_USO_FALTA', 'AUTO_TASAS_HUECOS']));
    expect(codigos(r, 'aviso')).toEqual(expect.arrayContaining(['AUTO_TIPO_USO_OTROS_RAMOS', 'AUTO_TASAS_NO_CASCO', 'AUTO_SIN_EQUIVALENTE_18']));
    expect(r.items.find((i) => i.codigo === 'AUTO_TASAS_HUECOS')?.seccion).toBe('tasas-antiguedad');
  });
});
