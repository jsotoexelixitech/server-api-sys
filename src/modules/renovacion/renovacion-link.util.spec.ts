import {
  armarLinkRenovacion,
  armarMetadataSso,
  enmascararToken,
  envTrue,
  expiraJwt,
  permiteLink,
} from './renovacion-link.util';

const jwt = (payload: object) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.firma`;

const datosRcv = {
  cnpoliza: '18-1-1000033143',
  poliza_origen: { cramo: 18, cproductor: '80080', ccanalalt: '30', ctipocanal: 'A', cgestor: ' G-1 ' },
  plan_actual: { cproducto: '24' },
  canal_planes: { centidad: 'C', citem: '30' },
};

describe('renovacion-link.util', () => {
  it('permiteLink: elegible siempre; fuera de ventana solo con flag; anulada/ya renovada nunca', () => {
    expect(permiteLink(true, 'ELEGIBLE', false)).toBe(true);
    expect(permiteLink(false, 'FUERA_DE_VENTANA', false)).toBe(false);
    expect(permiteLink(false, 'FUERA_DE_VENTANA', true)).toBe(true);
    expect(permiteLink(false, 'ANTES_DE_VENTANA', true)).toBe(true);
    expect(permiteLink(false, 'ANULADA', true)).toBe(false);
    expect(permiteLink(false, 'YA_RENOVADA', true)).toBe(false);
  });

  it('envTrue', () => {
    expect(envTrue('true')).toBe(true);
    expect(envTrue(' TRUE ')).toBe(true);
    expect(envTrue('false')).toBe(false);
    expect(envTrue(undefined)).toBe(false);
  });

  it('metadata RCV con canal alterno de la póliza', () => {
    expect(armarMetadataSso(datosRcv, { cusuario: '7' })).toEqual({
      cramo: 18,
      cproductor: '80080',
      centidad: 'C',
      citem: '30',
      ccanalalt_in: '30',
      ccanalalt: '30',
      ctipocanal: 'A',
      cgestor: 'G-1',
      cproducto: '24',
      cusuario: '7',
      product: 'rcv',
    });
  });

  it('metadata sin strings vacíos y productor por defecto', () => {
    const meta = armarMetadataSso(
      {
        cnpoliza: '9-1-1',
        poliza_origen: { cramo: 9, cproductor: null, ccanalalt: ' ', ctipocanal: null, cgestor: '' },
        plan_actual: { cproducto: null },
        canal_planes: { centidad: 'P', citem: '80080' },
      },
      { cusuario: '', productorDefault: '80080' },
    );
    expect(meta).toEqual({ cramo: 9, cproductor: '80080', centidad: 'P', citem: '80080', product: 'funerario' });
  });

  it('link: agrega renovar al redirect_url de Nexus conservando product', () => {
    const link = armarLinkRenovacion(
      'https://cierrelmds.exelixitech.com/ocr/?nexus_token=abc.def.ghi&product=funerario',
      '9-1-1',
    );
    const u = new URL(link);
    expect(u.origin + u.pathname).toBe('https://cierrelmds.exelixitech.com/ocr/');
    expect(u.searchParams.get('nexus_token')).toBe('abc.def.ghi');
    expect(u.searchParams.get('product')).toBe('funerario');
    expect(u.searchParams.get('renovar')).toBe('9-1-1');
  });

  it('link: RENOVACION_LINK_BASE reemplaza la base', () => {
    const link = armarLinkRenovacion('http://192.168.8.120:5100/?nexus_token=t1', '18-1-1', 'https://cierrelmds.exelixitech.com/ocr/');
    expect(link).toBe('https://cierrelmds.exelixitech.com/ocr/?nexus_token=t1&renovar=18-1-1');
  });

  it('link: sin nexus_token es error', () => {
    expect(() => armarLinkRenovacion('https://x/ocr/', '1')).toThrow('nexus_token');
  });

  it('expiraJwt y enmascararToken', () => {
    expect(expiraJwt(jwt({ exp: 1800000000 }))).toBe(new Date(1800000000 * 1000).toISOString());
    expect(expiraJwt('basura')).toBeNull();
    expect(enmascararToken('https://h/ocr/?nexus_token=eyJhbGciOiJIUzI1NiJ9.xyz&renovar=1')).toBe(
      'https://h/ocr/?nexus_token=eyJhbGci***&renovar=1',
    );
  });
});
