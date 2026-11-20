import { BadGatewayException, BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { CotizacionesAutoController } from './cotizaciones-auto.controller';
import type { CotizacionesAutoRepository } from './cotizaciones-auto.repository';
import { CotizacionesAutoService, parseCproces } from './cotizaciones-auto.service';
import { CotizacionesAutoSource } from './cotizaciones-auto.source';
import type { CotizacionAutoComplemento } from './cotizaciones-auto.types';

/** Datos ficticios. */
const CPROCES = '202600310558';
const CREADA = '2026-11-10T14:32:05.000Z';
const ANTES_DE_VENCER = new Date('2026-11-20T12:00:00.000Z');

/** Fila 1 de sp_cotizaciones_get (mssql: DATE/DATETIME como Date, NUMERIC como number). */
const spRow = (extra: Record<string, unknown> = {}) => ({
  id: 202600310558,
  fechaCotizacion: new Date(CREADA),
  vigenciaDesde: new Date('2026-11-10T00:00:00.000Z'),
  vigenciaHasta: new Date('2027-11-10T00:00:00.000Z'),
  planCodigo: 'AutoV ',
  planNombre: 'Plan 10.000$ (RCV,EL,DP,APOV, CLUB DIAMANTE)',
  productorCodigo: 80080,
  usuarioCodigo: 7,
  moneda: '$',
  emitida: false,
  polizaNumero: null,
  opcionEmitida: null,
  tomadorDocumento: '12345678',
  tomadorTipo: 'V',
  tomadorNombre: 'JUAN PEREZ',
  marcaCodigo: '074',
  marcaNombre: 'TOYOTA',
  modeloCodigo: '005',
  modeloNombre: 'COROLLA',
  versionCodigo: '67',
  versionNombre: 'LE Eco - CVT',
  anio: 2015,
  tipoVehiculo: 1,
  uso: 1,
  puestos: 5,
  toneladas: 0,
  tipoPlaca: 'N',
  valorVehiculo: 24817,
  total: 1,
  ...extra,
});

const cob = (opcion: number, cobertura: number, nombre: string, primaUsd: number, suma: number, ajuste = 0) => ({
  cotizacionId: 202600310558,
  opcion,
  cobertura,
  nombre,
  sumaAseguradaUsd: suma,
  primaUsd,
  ajustePorcentaje: ajuste,
});

const COBERTURAS_RCV = [cob(1, 10, 'RCV DAÑOS A COSAS', 60.26, 5000), cob(1, 11, 'RCV DAÑOS A PERSONAS', 60.25, 5000)];
const COBERTURAS_CASCO_Y_RCV = [
  cob(1, 10, 'RCV DAÑOS A COSAS', 60, 5000),
  cob(1, 1, 'COBERTURA AMPLIA', 900.1, 24817, -10),
  cob(2, 10, 'RCV DAÑOS A COSAS', 60, 5000),
];

/**
 * Lo que publica el API de SysIP (GET /api/v1/cotizaciones/:id → data) para la misma cotización que spRow +
 * COBERTURAS_RCV, escrito a mano a partir de cotizaciones.service.js (origin/qa) y ya pasado por JSON.
 */
const apiRcv = () => ({
  id: 202600310558,
  fechaCotizacion: CREADA,
  vigencia: { desde: '2026-11-10T00:00:00.000Z', hasta: '2027-11-10T00:00:00.000Z' },
  plan: { codigo: 'AutoV ', nombre: 'Plan 10.000$ (RCV,EL,DP,APOV, CLUB DIAMANTE)' },
  productor: { codigo: 80080 },
  usuario: { codigo: 7 },
  moneda: '$',
  emitida: false,
  poliza: null,
  vehiculo: {
    marca: { codigo: '074', nombre: 'TOYOTA' },
    modelo: { codigo: '005', nombre: 'COROLLA' },
    version: { codigo: '67', nombre: 'LE Eco - CVT' },
    anio: 2015,
    tipo: 1,
    uso: 1,
    puestos: 5,
    toneladas: 0,
    tipoPlaca: 'N',
  },
  coberturaCasco: null,
  ajustePorcentaje: 0,
  sumaAseguradaUsd: 24817,
  primaUsd: 120.51,
  opciones: [
    {
      opcion: 1,
      coberturaCasco: null,
      ajustePorcentaje: 0,
      sumaAseguradaUsd: 24817,
      primaUsd: 120.51,
      coberturas: [
        { codigo: 10, nombre: 'RCV DAÑOS A COSAS', casco: null, sumaAseguradaUsd: 5000, primaUsd: 60.26 },
        { codigo: 11, nombre: 'RCV DAÑOS A PERSONAS', casco: null, sumaAseguradaUsd: 5000, primaUsd: 60.25 },
      ],
    },
  ],
  coberturas: [
    { codigo: 10, nombre: 'RCV DAÑOS A COSAS', casco: null, sumaAseguradaUsd: 5000, primaUsd: 60.26 },
    { codigo: 11, nombre: 'RCV DAÑOS A PERSONAS', casco: null, sumaAseguradaUsd: 5000, primaUsd: 60.25 },
  ],
});

/** Igual que apiRcv pero con COBERTURAS_CASCO_Y_RCV (opción 1 casco con -10 %, opción 2 solo RCV). */
const apiCascoYRcv = () => {
  const opcion1 = [
    { codigo: 10, nombre: 'RCV DAÑOS A COSAS', casco: null, sumaAseguradaUsd: 5000, primaUsd: 60 },
    { codigo: 1, nombre: 'COBERTURA AMPLIA', casco: 'CA', sumaAseguradaUsd: 24817, primaUsd: 900.1 },
  ];
  return {
    ...apiRcv(),
    coberturaCasco: 'CA',
    ajustePorcentaje: -10,
    primaUsd: 960.1,
    opciones: [
      { opcion: 1, coberturaCasco: 'CA', ajustePorcentaje: -10, sumaAseguradaUsd: 24817, primaUsd: 960.1, coberturas: opcion1 },
      {
        opcion: 2,
        coberturaCasco: null,
        ajustePorcentaje: 0,
        sumaAseguradaUsd: 24817,
        primaUsd: 60,
        coberturas: [{ codigo: 10, nombre: 'RCV DAÑOS A COSAS', casco: null, sumaAseguradaUsd: 5000, primaUsd: 60 }],
      },
    ],
    coberturas: opcion1,
  };
};

const complemento = (extra: Partial<CotizacionAutoComplemento> = {}): CotizacionAutoComplemento => ({
  cramo: 18,
  ctenedor: '12345678',
  cid: 'V-12345678',
  xcliente: 'JUAN PEREZ',
  cproductor: 80080,
  xproductor: 'PRODUCTOR DE EJEMPLO',
  cpoliza: null,
  cnpoliza: null,
  xtipo: 'PARTICULARES',
  xuso: 'PARTICULAR',
  ramoRcvAparte: null,
  ...extra,
});

const API_ENV = {
  SYSIP_COTIZACIONES_URL: 'https://sysip.example/api/v1/cotizaciones/',
  SYSIP_COTIZACIONES_APIKEY: 'llave-de-prueba',
};

function build(opts: {
  env?: Record<string, string>;
  sp?: { cotizaciones: Record<string, unknown>[]; coberturas: Record<string, unknown>[] } | Error;
  complemento?: CotizacionAutoComplemento | null | Error;
}) {
  const config = { get: (key: string) => opts.env?.[key] } as unknown as ConfigService;
  const repository = {
    getCotizacionSp: jest.fn(async () => {
      if (opts.sp instanceof Error) throw opts.sp;
      return opts.sp ?? { cotizaciones: [], coberturas: [] };
    }),
    getComplemento: jest.fn(async () => {
      if (opts.complemento instanceof Error) throw opts.complemento;
      return opts.complemento === undefined ? complemento() : opts.complemento;
    }),
  } as unknown as jest.Mocked<CotizacionesAutoRepository>;
  const source = new CotizacionesAutoSource(config, repository);
  const service = new CotizacionesAutoService(source, repository);
  return { source, service, repository };
}

function mockFetch(status: number, body: unknown) {
  return jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

afterEach(() => jest.restoreAllMocks());

describe('CotizacionesAutoSource: modo', () => {
  it('usa el API con las dos variables y el SP si falta alguna', () => {
    expect(build({ env: API_ENV }).source.modo).toBe('api');
    expect(build({ env: { SYSIP_COTIZACIONES_URL: API_ENV.SYSIP_COTIZACIONES_URL } }).source.modo).toBe('sp');
    expect(build({ env: { SYSIP_COTIZACIONES_APIKEY: 'x' } }).source.modo).toBe('sp');
    expect(build({}).source.modo).toBe('sp');
  });
});

describe('modo API y modo SP producen el mismo contrato', () => {
  it.each([
    ['solo RCV', COBERTURAS_RCV, apiRcv],
    ['casco y RCV en dos opciones', COBERTURAS_CASCO_Y_RCV, apiCascoYRcv],
  ])('%s', async (_nombre, coberturas, api) => {
    const sp = build({ sp: { cotizaciones: [spRow()], coberturas } });
    const desdeSp = await sp.service.getCotizacion(CPROCES, ANTES_DE_VENCER);
    expect(sp.repository.getCotizacionSp).toHaveBeenCalledWith(CPROCES);

    const fetchSpy = mockFetch(200, { status: true, data: api(), message: 'Consulta realizada correctamente.' });
    const viaApi = build({ env: API_ENV });
    const desdeApi = await viaApi.service.getCotizacion(CPROCES, ANTES_DE_VENCER);
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://sysip.example/api/v1/cotizaciones/${CPROCES}`,
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ apikey: 'llave-de-prueba' }) }),
    );
    expect(viaApi.repository.getCotizacionSp).not.toHaveBeenCalled();

    expect(desdeApi).toEqual(desdeSp);
    expect(viaApi.repository.getComplemento).toHaveBeenCalledWith(CPROCES, { tipo: 1, uso: 1 });
  });

  it('arma el contrato completo de una cotización emitible', async () => {
    const { service } = build({ sp: { cotizaciones: [spRow()], coberturas: COBERTURAS_RCV } });
    expect(await service.getCotizacion(CPROCES, ANTES_DE_VENCER)).toEqual({
      cproces: CPROCES,
      codigo: null,
      creadaEn: CREADA,
      venceEl: '2026-11-25T14:32:05.000Z',
      vencida: false,
      ramo: 18,
      plan: { codigo: 'AutoV', nombre: 'Plan 10.000$ (RCV,EL,DP,APOV, CLUB DIAMANTE)' },
      productor: { codigo: 80080, nombre: 'PRODUCTOR DE EJEMPLO' },
      usuario: 7,
      vigencia: { desde: '2026-11-10', hasta: '2027-11-10', dias: 365 },
      tomador: { tipoDoc: 'V', documento: '12345678', nombre: 'JUAN PEREZ' },
      vehiculo: {
        marca: { codigo: '074', nombre: 'TOYOTA' },
        modelo: { codigo: '005', nombre: 'COROLLA' },
        version: { codigo: '67', nombre: 'LE Eco - CVT' },
        anio: 2015,
        tipo: { codigo: 1, nombre: 'PARTICULARES' },
        uso: { codigo: 1, nombre: 'PARTICULAR' },
        puestos: 5,
        toneladas: 0,
        tipoPlaca: 'N',
      },
      opciones: [
        {
          opcion: 1,
          primaUsd: 120.51,
          soloRcv: true,
          coberturas: [
            { codigo: 10, nombre: 'RCV DAÑOS A COSAS', primaUsd: 60.26, sumaAseguradaUsd: 5000, ajustePorcentaje: 0 },
            { codigo: 11, nombre: 'RCV DAÑOS A PERSONAS', primaUsd: 60.25, sumaAseguradaUsd: 5000, ajustePorcentaje: 0 },
          ],
        },
      ],
      emitida: false,
      poliza: null,
      opcionEmitida: null,
      emitible: true,
      motivos: [],
    });
  });

  it('el ajuste de la opción queda solo en la cobertura de casco', async () => {
    const { service } = build({ sp: { cotizaciones: [spRow()], coberturas: COBERTURAS_CASCO_Y_RCV } });
    const { opciones } = await service.getCotizacion(CPROCES, ANTES_DE_VENCER);
    expect(opciones.map((o) => [o.opcion, o.primaUsd, o.soloRcv])).toEqual([
      [1, 960.1, false],
      [2, 60, true],
    ]);
    expect(opciones[0].coberturas.map((c) => c.ajustePorcentaje)).toEqual([0, -10]);
  });

  it('sin complemento de tomador usa el que trae el SP', async () => {
    const { service } = build({
      sp: { cotizaciones: [spRow()], coberturas: COBERTURAS_RCV },
      complemento: complemento({ cid: null, ctenedor: null, xcliente: null }),
    });
    const { tomador } = await service.getCotizacion(CPROCES, ANTES_DE_VENCER);
    expect(tomador).toEqual({ tipoDoc: 'V', documento: '12345678', nombre: 'JUAN PEREZ' });
  });
});

describe('motivos', () => {
  const contrato = (sp: Record<string, unknown>, comp: Partial<CotizacionAutoComplemento> = {}, now = ANTES_DE_VENCER, coberturas = COBERTURAS_RCV) =>
    build({ sp: { cotizaciones: [spRow(sp)], coberturas }, complemento: complemento(comp) }).service.getCotizacion(CPROCES, now);
  const codigos = (c: { motivos: { codigo: string }[] }) => c.motivos.map((m) => m.codigo);

  it('CASCO solo si ninguna opción es Solo RCV (Amplia, Pérdida total o Pérdida parcial en todas)', async () => {
    for (const codigo of [1, 2, 28]) {
      const c = await contrato({}, {}, ANTES_DE_VENCER, [cob(1, codigo, 'CASCO', 300, 20000), cob(1, 10, 'RCV', 50, 5000)]);
      expect(codigos(c)).toEqual(['CASCO']);
      expect(c.motivos[0].mensaje).toBe('Esta cotización no tiene opción Solo RCV: se emite en Auto Casco.');
      expect(c.emitible).toBe(false);
    }
  });

  it('con una opción Solo RCV y otras con casco es emitible (se emite la Solo RCV)', async () => {
    for (const codigo of [1, 2, 28]) {
      const c = await contrato({}, {}, ANTES_DE_VENCER, [cob(1, 10, 'RCV', 50, 5000), cob(2, codigo, 'CASCO', 300, 20000)]);
      expect(codigos(c)).toEqual([]);
      expect(c.emitible).toBe(true);
      expect(c.opciones.some((o) => o.soloRcv)).toBe(true);
    }
  });

  it('EMITIDA con su póliza y la opción emitida', async () => {
    const c = await contrato({ emitida: true, polizaNumero: '1-18-0001234', opcionEmitida: 1 }, { cpoliza: '99' });
    expect(codigos(c)).toEqual(['EMITIDA']);
    expect(c).toMatchObject({ emitida: true, poliza: '1-18-0001234', opcionEmitida: 1, emitible: false });
  });

  it('EMITIDA también si sopoliza ya tiene cpoliza', async () => {
    const c = await contrato({}, { cpoliza: '99', cnpoliza: '1-18-0009999' });
    expect(codigos(c)).toEqual(['EMITIDA']);
    expect(c.poliza).toBe('1-18-0009999');
    expect(c.opcionEmitida).toBe(1);
  });

  it('VENCIDA pasados 15 días desde que se creó', async () => {
    const justo = await contrato({}, {}, new Date('2026-11-25T14:32:05.000Z'));
    expect(justo.vencida).toBe(false);
    const c = await contrato({}, {}, new Date('2026-11-25T14:32:06.000Z'));
    expect(codigos(c)).toEqual(['VENCIDA']);
    expect(c.vencida).toBe(true);
  });

  it('RAMO si no es ramo 18', async () => {
    const c = await contrato({}, { cramo: 28 });
    expect(codigos(c)).toEqual(['RAMO']);
    expect(c.ramo).toBe(28);
  });

  it('RCVA si el plan emite el RCV aparte (separam RCVA)', async () => {
    const c = await contrato({}, { ramoRcvAparte: 26 });
    expect(codigos(c)).toEqual(['RCVA']);
    expect(c.motivos[0].mensaje).toContain('AutoV');
  });

  it('acumula motivos en orden fijo', async () => {
    const c = await contrato({ emitida: true, polizaNumero: 'X' }, { cramo: 28, ramoRcvAparte: 26 }, new Date('2027-01-01'), [cob(1, 1, 'CASCO', 300, 20000)]);
    expect(codigos(c)).toEqual(['CASCO', 'EMITIDA', 'VENCIDA', 'RAMO', 'RCVA']);
  });
});

describe('errores', () => {
  it('400 si cproces no son 1 a 20 dígitos', async () => {
    for (const bad of ['abc', '', '12a', '123456789012345678901', '0', '-1', '1.5']) {
      expect(() => parseCproces(bad)).toThrow(BadRequestException);
    }
    expect(parseCproces(' 202600310558 ')).toBe(CPROCES);
    const { service } = build({});
    await expect(new CotizacionesAutoController(service).getCotizacion('abc')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el controller responde { status, data }', async () => {
    const { service } = build({ sp: { cotizaciones: [spRow()], coberturas: COBERTURAS_RCV } });
    const res = await new CotizacionesAutoController(service).getCotizacion(CPROCES);
    expect(res.status).toBe(true);
    expect(res.data.cproces).toBe(CPROCES);
  });

  const codeOf = (err: unknown) => ((err as NotFoundException).getResponse() as { code?: string }).code;

  it('404 COTIZACION_NO_EXISTE si el SP no devuelve fila', async () => {
    const err = await build({}).service.getCotizacion(CPROCES).catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(codeOf(err)).toBe('COTIZACION_NO_EXISTE');
  });

  it('404 COTIZACION_NO_EXISTE si el API responde 404', async () => {
    mockFetch(404, { status: false, message: 'No existe una cotización de automóvil con ese número.' });
    const err = await build({ env: API_ENV }).service.getCotizacion(CPROCES).catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(codeOf(err)).toBe('COTIZACION_NO_EXISTE');
  });

  it('404 si la fuente la tiene pero sopoliza no', async () => {
    const err = await build({ sp: { cotizaciones: [spRow()], coberturas: [] }, complemento: null })
      .service.getCotizacion(CPROCES)
      .catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundException);
  });

  it('503 si el API no responde y 502 si responde con error o sin data', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1:443'));
    let err = await build({ env: API_ENV }).service.getCotizacion(CPROCES).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify(err.getResponse())).not.toContain('ECONNREFUSED');

    jest.restoreAllMocks();
    mockFetch(500, { status: false, message: 'Error interno' });
    err = await build({ env: API_ENV }).service.getCotizacion(CPROCES).catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);

    jest.restoreAllMocks();
    mockFetch(401, { status: false, message: 'apikey inválida' });
    err = await build({ env: API_ENV }).service.getCotizacion(CPROCES).catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);

    jest.restoreAllMocks();
    mockFetch(200, { status: true, data: null });
    err = await build({ env: API_ENV }).service.getCotizacion(CPROCES).catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
  });

  it('503 sin conexión a Sis2000 y 502 si el SP falla', async () => {
    let err = await build({ sp: new Error('mssql pool is not connected') }).service.getCotizacion(CPROCES).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);

    const sqlError = Object.assign(new Error("The EXECUTE permission was denied on the object 'sp_cotizaciones_get'"), {
      code: 'EREQUEST',
      name: 'RequestError',
    });
    err = await build({ sp: sqlError }).service.getCotizacion(CPROCES).catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect(JSON.stringify(err.getResponse())).not.toContain('EXECUTE');

    err = await build({ sp: { cotizaciones: [spRow()], coberturas: [] }, complemento: sqlError })
      .service.getCotizacion(CPROCES)
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
  });
});
