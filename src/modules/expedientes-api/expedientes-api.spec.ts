import { ForbiddenException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import type { NestAuthContext } from '../auth/auth.types';
import {
  integradorDe,
  puedeUsarExpedientes,
  registroDesdeEmision,
  rutaDeHandler,
  tipoArchivo,
} from './expedientes-api.rules';
import { ExpedientesApiService } from './expedientes-api.service';
import { ExpedientesRegistroInterceptor } from './expedientes-registro.interceptor';

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(50)]);

const AUTH_VIAJERO: NestAuthContext = {
  apikey: 'nest_viajero',
  apiKeyId: 'k-viajero',
  scopes: ['emissions:person'],
  xcanalVenta: 'MARGARITA TOURS',
  via: 'apikey',
};

function respuesta(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function crearServicio(env: Record<string, string> = { NEXUS_EXPEDIENTES_URL: 'http://nexus:3092/', NEXUS_EXPEDIENTES_KEY: 'k' }) {
  const config = { get: (k: string) => env[k] } as any;
  const channels = {
    resolveChannel: jest.fn(async () => ({ ccanalalt: 27, cscanalalt: null, cproductor: 80080, xcanal_venta: 'PASTORA' })),
  } as any;
  return { svc: new ExpedientesApiService(config, channels), channels };
}

describe('expedientes-api reglas', () => {
  it('integrador: id de la key nest_; legacy por hash (nunca la clave)', () => {
    expect(integradorDe(AUTH_VIAJERO)).toBe('key:k-viajero');
    const legacy = integradorDe({ apikey: 'token-maclient', apiKeyId: 'legacy-maclient', scopes: ['*'], via: 'apikey' });
    expect(legacy).toMatch(/^sha:[0-9a-f]{48}$/);
    expect(legacy).not.toContain('token-maclient');
    expect(integradorDe({ apikey: '', scopes: [], via: 'none' })).toBeNull();
  });

  it('scopes: los de emisión de Pastora/Viajero o documents:write', () => {
    expect(puedeUsarExpedientes(['emissions:person'])).toBe(true);
    expect(puedeUsarExpedientes(['emissions:riesgos-generales'])).toBe(true);
    expect(puedeUsarExpedientes(['documents:write'])).toBe(true);
    expect(puedeUsarExpedientes(['POST /api/v1/viajero-7-dias/emision'])).toBe(true);
    expect(puedeUsarExpedientes(['emissions:auto'])).toBe(false);
    expect(puedeUsarExpedientes([])).toBe(false);
  });

  it('archivos: PDF/JPG/PNG/WEBP por contenido', () => {
    expect(tipoArchivo(JPG)).toBe('image/jpeg');
    expect(tipoArchivo(WEBP)).toBe('image/webp');
    expect(tipoArchivo(Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(20)]))).toBe('application/pdf');
    expect(tipoArchivo(Buffer.from('<html><body>hola</body></html>'))).toBeNull();
  });

  it('ruta del handler sin prefijo', () => {
    expect(rutaDeHandler('v1/riesgos-generales', 'emision')).toBe('v1/riesgos-generales/emision');
    expect(rutaDeHandler('/v1/viajero-7-dias/', '/emision')).toBe('v1/viajero-7-dias/emision');
  });

  it('Pastora: solo ramo 25, tomador como persona del expediente', () => {
    const body = { cramo: 25, cplan: 'PAS06', tomador: { tipo_cedula: 'J', rif: '412345678', nombre: 'LA PASTORA' } };
    const r = registroDesdeEmision('pastora', body, { status: true, data: { cnpoliza: '2501-1', cnrecibo: '77' } });
    expect(r).toMatchObject({
      producto: 'pastora',
      cnpoliza: '2501-1',
      cnrecibo: '77',
      cramo: 25,
      cplan: 'PAS06',
      personas: [{ tipoDoc: 'J', documento: '412345678', nombre: 'LA PASTORA' }],
    });
    expect(registroDesdeEmision('pastora', { ...body, cramo: 38 }, { data: { cnpoliza: 'x' } })).toBeNull();
    expect(registroDesdeEmision('pastora', body, { data: {} })).toBeNull();
  });

  it('Viajero: titular (pasaporte) y asegurados; plan de la ruta', () => {
    const body = {
      cid_titular: 'P-EM2849387',
      rif_titular: 2849387,
      nombre_titular: 'JOHN',
      apellido_titular: 'SMITH',
      rif_tomador: 11222333,
      tipo_cedula_tomador: 'V',
      asegurados: [{ xrif_asegurado: '11222333', icedula_asegurado: 'V', xnombre_asegurado: 'ANA' }],
      ccanalalt_in: 31,
    };
    const r = registroDesdeEmision('viajero', body, { status: true, result: { cnpoliza: '2501-9' } }, 'VIAJE4');
    expect(r).toMatchObject({
      producto: 'viajero',
      cnpoliza: '2501-9',
      cplan: 'VIAJE4',
      ccanalaltBody: '31',
      tomador: { tipoDoc: 'V', documento: '11222333' },
      personas: [
        { tipoDoc: 'P', documento: 'P-EM2849387', nombre: 'JOHN' },
        { tipoDoc: 'V', documento: '11222333', nombre: 'ANA' },
      ],
    });
  });
});

describe('ExpedientesApiService', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  it('estado: reenvía a Nexus con la clave interna y el integrador', async () => {
    const { svc } = crearServicio();
    const data = { cnpoliza: '2501-9', estado: 'incompleto', documentos: [{ tipo: 'cedula', estado: 'pendiente' }] };
    fetchMock.mockResolvedValue(respuesta(200, { status: 'success', data }));
    await expect(svc.estado(AUTH_VIAJERO, '2501-9')).resolves.toEqual(data);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://nexus:3092/api/expedientes/integracion/polizas/2501-9');
    expect(init.headers).toMatchObject({ 'x-expediente-key': 'k', 'x-integrador': 'key:k-viajero' });
  });

  it('estado: 404 de Nexus → 404; Nexus caído → 503; key sin scope → 403', async () => {
    const { svc } = crearServicio();
    fetchMock.mockResolvedValueOnce(respuesta(404, { message: 'Póliza no encontrada.' }));
    await expect(svc.estado(AUTH_VIAJERO, '2501-9')).rejects.toBeInstanceOf(NotFoundException);
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(svc.estado(AUTH_VIAJERO, '2501-9')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(svc.estado({ ...AUTH_VIAJERO, scopes: ['emissions:auto'] }, '2501-9')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(svc.estado(AUTH_VIAJERO, '../x')).rejects.toBeInstanceOf(HttpException);
  });

  it('sin configuración de Nexus: 503', async () => {
    const { svc } = crearServicio({});
    await expect(svc.estado(AUTH_VIAJERO, '2501-9')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('subir: valida archivo y reenvía multipart; errores de Nexus con su mensaje', async () => {
    const { svc } = crearServicio();
    await expect(svc.subir(AUTH_VIAJERO, '2501-9', 'cedula', '11222333', undefined)).rejects.toMatchObject({ status: 400 });
    await expect(
      svc.subir(AUTH_VIAJERO, '2501-9', 'cedula', '1', { buffer: Buffer.from('hola mundo html!'), size: 16 }),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      svc.subir(AUTH_VIAJERO, '2501-9', 'cedula', '1', { buffer: JPG, size: 11 * 1024 * 1024 }),
    ).rejects.toMatchObject({ status: 413 });

    fetchMock.mockResolvedValueOnce(
      respuesta(201, { data: { tipo: 'pasaporte', documento: 'EM2849387', estado: 'recibido' } }),
    );
    await expect(
      svc.subir(AUTH_VIAJERO, '2501-9', 'pasaporte', 'P-EM2849387', { buffer: WEBP, size: WEBP.length, originalname: 'pas.webp' }),
    ).resolves.toEqual({ tipo: 'pasaporte', documento: 'EM2849387', estado: 'recibido' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://nexus:3092/api/expedientes/integracion/polizas/2501-9/documentos');
    const form = init.body as FormData;
    expect(form.get('tipo')).toBe('pasaporte');
    expect(form.get('documento')).toBe('P-EM2849387');
    expect((form.get('file') as File).type).toBe('image/webp');

    fetchMock.mockResolvedValueOnce(
      respuesta(400, { message: 'documento es obligatorio en Viajero (número de la persona).' }),
    );
    await expect(
      svc.subir(AUTH_VIAJERO, '2501-9', 'cedula', undefined, { buffer: JPG, size: JPG.length }),
    ).rejects.toMatchObject({ status: 400, message: 'documento es obligatorio en Viajero (número de la persona).' });
  });

  it('registrarEmision: canal de la key y sin reintentar los 4xx', async () => {
    const { svc } = crearServicio();
    fetchMock.mockResolvedValueOnce(respuesta(201, { data: { id: 1, creado: true } }));
    const ok = await svc.registrarEmision(
      AUTH_VIAJERO,
      {
        producto: 'viajero',
        cnpoliza: '2501-9',
        cnrecibo: null,
        cramo: 25,
        cplan: 'VIAJE4',
        tomador: null,
        personas: [{ tipoDoc: 'V', documento: '11222333', nombre: 'ANA', apellido: null }],
        ccanalaltBody: null,
      },
      [],
    );
    expect(ok).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      integrador: 'key:k-viajero',
      apiKeyId: 'k-viajero',
      producto: 'viajero',
      canal: { centidad: 'C', ccanalalt: '27', cproductor: '80080', xcanalVenta: 'MARGARITA TOURS' },
    });

    fetchMock.mockResolvedValueOnce(respuesta(409, { message: 'ya registrada' }));
    await expect(
      svc.registrarEmision(AUTH_VIAJERO, { ...JSON.parse('{}'), producto: 'viajero', cnpoliza: 'x', personas: [] }, [0, 0]),
    ).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValue(respuesta(502, {}));
    await expect(
      svc.registrarEmision(AUTH_VIAJERO, { ...JSON.parse('{}'), producto: 'viajero', cnpoliza: 'y', personas: [] }, [0, 0]),
    ).resolves.toBe(false);
    // 1 intento + 2 reintentos.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

describe('ExpedientesRegistroInterceptor', () => {
  class RiesgosGeneralesController {
    emitir() {
      return null;
    }
    cotizar() {
      return null;
    }
  }
  Reflect.defineMetadata('path', 'v1/riesgos-generales', RiesgosGeneralesController);
  Reflect.defineMetadata('path', 'emision', RiesgosGeneralesController.prototype.emitir);
  Reflect.defineMetadata('path', 'cotizacion', RiesgosGeneralesController.prototype.cotizar);

  function contexto(handler: unknown, body: unknown, method = 'POST') {
    const req = { method, body, nestAuth: AUTH_VIAJERO };
    return {
      getType: () => 'http',
      getClass: () => RiesgosGeneralesController,
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;
  }

  it('registra Pastora tras emitir y no toca otras rutas', async () => {
    const svc = { registrarEmision: jest.fn(async () => true) } as any;
    const interceptor = new ExpedientesRegistroInterceptor(svc);
    const body = { cramo: 25, cplan: 'PAS06', tomador: { tipo_cedula: 'V', rif: '11222333', nombre: 'ANA' } };
    const resp = { status: true, data: { cnpoliza: '2501-1' } };

    const out = await lastValueFrom(
      interceptor.intercept(contexto(RiesgosGeneralesController.prototype.emitir, body), { handle: () => of(resp) }),
    );
    expect(out).toBe(resp);
    expect(svc.registrarEmision).toHaveBeenCalledWith(
      AUTH_VIAJERO,
      expect.objectContaining({ producto: 'pastora', cnpoliza: '2501-1' }),
    );

    svc.registrarEmision.mockClear();
    await lastValueFrom(
      interceptor.intercept(contexto(RiesgosGeneralesController.prototype.cotizar, body), { handle: () => of(resp) }),
    );
    await lastValueFrom(
      interceptor.intercept(contexto(RiesgosGeneralesController.prototype.emitir, { ...body, cramo: 38 }), {
        handle: () => of(resp),
      }),
    );
    expect(svc.registrarEmision).not.toHaveBeenCalled();
  });
});
