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
    d.familia = 'patrimonial';
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
      'PLAN_NO_VIGENTE', 'PRODUCTO_LARGO', 'PRODUCTO_NO_EXISTE', 'TARIFA_NO_EXISTE', 'TARIFA_SIN_DETALLE',
      'TARIFA_DETALLE_DUPLICADO', 'REASEGURO_INCOMPLETO', 'COMISION_FALTA', 'CANALES_FALTAN',
    ]));
    expect(codigos(r, 'aviso')).toEqual(expect.arrayContaining(['PLAN_CODIGO_REPETIDO', 'FRECUENCIA_DESCONOCIDA', 'FRECUENCIA_K_NO_AUTO']));
    expect(codigos(r).some((c) => c.startsWith('AUTO_'))).toBe(false);
  });

  it('datos reales: cplan repetido entre ramos (BINAC en 18 y 28) es aviso con los ramos y el riesgo, no error', () => {
    const r = revisarPlan({ ...base(), cplan: 'BINAC ', ramosConMismoPlan: [28] });
    expect(r.listo).toBe(true);
    const item = r.items.find((i) => i.codigo === 'PLAN_CODIGO_REPETIDO');
    expect(item?.nivel).toBe('aviso');
    expect(item?.mensaje).toContain('ramo(s) 28');
    expect(item?.mensaje).toMatch(/solo por cplan/);
  });

  it('datos reales: frecuencia D válida y minúscula como aviso', () => {
    const r = revisarPlan({ ...base(), frecuenciasV: ['A', 'D', 's'] });
    expect(r.listo).toBe(true);
    expect(codigos(r)).not.toContain('FRECUENCIA_DESCONOCIDA');
    expect(codigos(r, 'aviso')).toContain('FRECUENCIA_MINUSCULA');
    expect(r.items.find((i) => i.codigo === 'FRECUENCIA_MINUSCULA')?.mensaje).toMatch(/minúscula: s./);
  });

  it('personas: el plan debe estar en maplanes_per', () => {
    const d = { ...base(), familia: 'personas' as const, auto: undefined };
    expect(codigos(revisarPlan(d), 'error')).toContain('PLAN_TABLA_FAMILIA');
    d.cabeceras = [{ tabla: 'maplanes_per', iestado: 'V', cproducto: 'VIDA1' }];
    expect(codigos(revisarPlan(d), 'error')).toEqual([]);
  });

  it('comisiones repetidas por cobertura en el ramo (aunque sean de otro plan): aviso con el SP de emisión auto/flota', () => {
    const d = base();
    d.aranceles = [
      { cplan: 'RCV01', ccober: '1', ctarifa: '1', iestado: 'V' },
      { cplan: 'OTRO', ccober: '1', ctarifa: '7', iestado: 'V' },
      { cplan: 'OTRO', ccober: '9', ctarifa: '1', iestado: 'V' },
      { cplan: 'OTRO', ccober: '6', ctarifa: '8', iestado: 'N' },
    ];
    const r = revisarPlan(d);
    expect(r.listo).toBe(true);
    expect(codigos(r, 'aviso')).toContain('COMISION_DUPLICADA_COBERTURA');
    // cramo+ctarifa solo lo usa la cotización de condominio: no aplica a auto.
    expect(codigos(r)).not.toContain('COMISION_DUPLICADA_TARIFA');
    const item = r.items.find((i) => i.codigo === 'COMISION_DUPLICADA_COBERTURA');
    expect(item?.seccion).toBe('comisiones');
    expect(item?.mensaje).toMatch(/sp_flota_incluir_certificado_nexus/);
  });

  it('familia patrimonial: tarifa repetida en el ramo es aviso (cotización de condominio)', () => {
    const d = { ...base(), familia: 'patrimonial' as const, auto: undefined };
    d.aranceles = [
      { cplan: 'RCV01', ccober: '1', ctarifa: '1', iestado: 'V' },
      { cplan: 'OTRO', ccober: '9', ctarifa: '1', iestado: 'V' },
    ];
    const r = revisarPlan(d);
    expect(r.listo).toBe(true);
    const item = r.items.find((i) => i.codigo === 'COMISION_DUPLICADA_TARIFA');
    expect(item?.nivel).toBe('aviso');
    expect(item?.mensaje).toMatch(/sp_calculo_cotizacion_condominio_nexus/);
  });

  it('datos reales ramo 18: una fila comodín por cobertura + RCVPRU por productor no es duplicado', () => {
    const comodin = (ccober: string) => ({ cplan: '0', ctipoprod: 0, cproductor: 0, ccober, ctarifa: '0', iestado: 'V' });
    const d = base();
    d.aranceles = [
      ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '28'].map(comodin),
      { cplan: 'RCVPRU', ctipoprod: 0, cproductor: 410948843, ccober: '0', ctarifa: '0', iestado: 'V' },
    ];
    const r = revisarPlan(d);
    expect(r.listo).toBe(true);
    expect(codigos(r).filter((c) => c.startsWith('COMISION_DUPLICADA'))).toEqual([]);
    expect(codigos(r, 'ok')).toContain('COMISION_OK');
  });

  it('misma llave lógica (sin fdesde) repetida en filas que aplican al plan: error', () => {
    const d = base();
    d.aranceles = [
      { cplan: 'RCV01', ctipoprod: 0, cproductor: 0, ccober: '1', ctarifa: '0', iestado: 'V' },
      { cplan: 'RCV01', ctipoprod: 0, cproductor: 0, ccober: '1', ctarifa: '0', iestado: 'V' },
      { cplan: 'RCV01', ctipoprod: 0, cproductor: 80080, ccober: '1', ctarifa: '0', iestado: 'V' },
    ];
    const r = revisarPlan(d);
    expect(r.listo).toBe(false);
    expect(r.items.filter((i) => i.codigo === 'COMISION_DUPLICADA' && i.nivel === 'error')).toHaveLength(1);
  });

  it('datos reales: tasas por antigüedad -1..2, 3..6, 7..11 (18/RIES1) válidas con aviso de tope', () => {
    const d = base();
    d.auto!.tasasAntiguedad = [
      { ccober: '1', ctarifa: '1', desde: -1, hasta: 2, pprima: 4 },
      { ccober: '1', ctarifa: '1', desde: 3, hasta: 6, pprima: 4.2 },
      { ccober: '1', ctarifa: '1', desde: 7, hasta: 11, pprima: 5 },
    ];
    const r = revisarPlan(d);
    expect(r.listo).toBe(true);
    expect(codigos(r, 'ok')).toContain('AUTO_TASAS_OK');
    expect(codigos(r, 'aviso')).toContain('AUTO_TASAS_TOPE');
    expect(r.items.find((i) => i.codigo === 'AUTO_TASAS_TOPE')?.mensaje).toMatch(/99012/);
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
