import { buildCatalogos, normalizeMoneda, TIPO_RECIBO_BASE } from './dgboss-catalogos.mapper';

describe('buildCatalogos', () => {
  const base = {
    lineas: [{ codigo: '4', descripcion: 'SALUD' }],
    ramos: [
      { codigo: '7', descripcion: 'SALUD', codigo_linea: '4' },
      { codigo: '99', descripcion: 'HUERFANO', codigo_linea: '77' },
    ],
    coberturas: [
      { codigo: '7-1', descripcion: 'MUERTE' },
      { codigo: '7-1', descripcion: 'DUP' },
      { codigo: '', descripcion: 'VACIA' },
    ],
    moneda: [{ codigo: '$', descripcion: 'DOLARES' }],
    producto: [{ codigo: '14', descripcion: 'Salud Individual' }],
    frecuencia: [{ codigo: 'A', descripcion: 'ANUAL' }],
  };

  it('arma los 12 arreglos obligatorios y el RIF', () => {
    const c = buildCatalogos('J000000001', base);
    expect(c.aseguradora_rif).toBe('J000000001');
    for (const k of [
      'lineas_negocio', 'ramos', 'coberturas', 'marcas', 'modelos', 'tipo_vehiculo',
      'moneda', 'producto', 'indole', 'frecuencia_pago', 'tipo_recibo',
    ] as const) {
      expect(Array.isArray(c[k])).toBe(true);
    }
  });

  it('descarta ramos cuya línea no existe y coberturas vacías o duplicadas', () => {
    const c = buildCatalogos('J1', base);
    expect(c.ramos.map((r) => r.codigo)).toEqual(['7']);
    expect(c.coberturas).toEqual([{ codigo: '7-1', descripcion: 'MUERTE' }]);
  });

  it('homologa USD y $ como $', () => {
    expect(normalizeMoneda('USD')).toBe('$');
    expect(normalizeMoneda('usd ')).toBe('$');
    expect(normalizeMoneda('$   ')).toBe('$');
    expect(normalizeMoneda('BS')).toBe('BS');
  });

  it('describe los tipos de recibo P, A y D', () => {
    expect(TIPO_RECIBO_BASE.map((x) => x.descripcion)).toEqual(['Pendiente', 'Anulado', 'Devuelto']);
  });
});
