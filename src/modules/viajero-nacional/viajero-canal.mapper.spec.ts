import {
  flattenMarketplaceCanal,
  normalizeViajeroBeneficiarios,
} from './viajero-canal.mapper';

describe('flattenMarketplaceCanal', () => {
  it('aplana canal anidado', () => {
    const out = flattenMarketplaceCanal({
      canal: {
        cproductor: 80080,
        ctipocanal: 'A',
        ccanalalt: 24,
        cscanalalt: 2,
        cusuario: 7,
      },
    });
    expect(out.productor).toBe(80080);
    expect(out.ctipocanal).toBe('A');
    expect(out.ccanalalt).toBe(24);
    expect(out.cscanalalt).toBe(2);
    expect(out.cusuario).toBe(7);
  });

  it('acepta gestor al estilo SysIP', () => {
    const out = flattenMarketplaceCanal({
      productor: 80080,
      gestor: { ccanalalt: 24, cscanalalt: 2, cgestor: 'ABC-1' },
    });
    expect(out.productor).toBe(80080);
    expect(out.ccanalalt).toBe(24);
    expect(out.cscanalalt).toBe(2);
    expect(out.cgestor).toBe('ABC-1');
  });

  it('centidad P usa citem como productor', () => {
    const out = flattenMarketplaceCanal({ centidad: 'P', citem: '12345' });
    expect(out.productor).toBe(12345);
    expect(out.cproductor).toBe(12345);
    expect(out.ccanalalt).toBeUndefined();
  });

  it('centidad C usa citem/csub y productor 80080', () => {
    const out = flattenMarketplaceCanal({
      centidad: 'C',
      citem: '24',
      csub: '2',
      ctipocanal: 'A',
    });
    expect(out.productor).toBe(80080);
    expect(out.ccanalalt).toBe(24);
    expect(out.cscanalalt).toBe(2);
    expect(out.ctipocanal).toBe('A');
  });

  it('productor explícito gana a centidad P', () => {
    const out = flattenMarketplaceCanal({
      centidad: 'P',
      citem: '12345',
      productor: 80080,
    });
    expect(out.productor).toBe(80080);
  });

  it('centidad G usa citem como cgestor', () => {
    const out = flattenMarketplaceCanal({ centidad: 'G', citem: 'gestor-9' });
    expect(out.cgestor).toBe('gestor-9');
  });
});

describe('normalizeViajeroBeneficiarios', () => {
  it('arma beneficiarios[] desde campos planos', () => {
    const out = normalizeViajeroBeneficiarios({
      rif_beneficiario: 17777888,
      tipo_cedula_beneficiario: 'V',
      nombre_beneficiario: 'ANA',
      apellido_beneficiario: 'PEREZ',
      sexo_beneficiario: 'F',
      cparen_beneficiario: 2,
      correo_beneficiario: 'ben3@exelixi.local',
    });
    const lista = out.beneficiarios as Record<string, unknown>[];
    expect(lista).toHaveLength(1);
    expect(lista[0].xrif_beneficiario).toBe(17777888);
    expect(lista[0].xnombre_beneficiario).toBe('ANA');
    expect(lista[0].nparentesco_beneficiario).toBe(2);
    expect(lista[0].pporce_beneficiario).toBe(100);
  });

  it('respeta beneficiarios[] si ya viene con RIF', () => {
    const out = normalizeViajeroBeneficiarios({
      rif_beneficiario: 1,
      beneficiarios: [{ xrif_beneficiario: 999, xnombre_beneficiario: 'LUZ' }],
    });
    const lista = out.beneficiarios as Record<string, unknown>[];
    expect(lista).toHaveLength(1);
    expect(lista[0].xrif_beneficiario).toBe(999);
  });

  it('no inventa beneficiario si no hay RIF', () => {
    const out = normalizeViajeroBeneficiarios({ nombre_titular: 'CARLOS' });
    expect(out.beneficiarios).toBeUndefined();
  });
});
