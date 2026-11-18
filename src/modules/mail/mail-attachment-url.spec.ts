import {
  construirPoliticaUrl,
  descargarAdjuntoUrl,
  detectarTipoAdjunto,
  esIpPrivada,
  validarUrlAdjunto,
} from './mail-attachment-url';

const politica = (env: Record<string, string> = {}) => construirPoliticaUrl((k) => env[k]);
const publica = jest.fn(async () => [{ address: '200.44.32.12', family: 4 }]);

describe('mail-attachment-url: lista blanca y SSRF', () => {
  it('por defecto: hosts de PDFs de Sis2000 y comodines de La Mundial y Exelixi', () => {
    const pol = politica();
    expect(pol.hosts).toEqual(
      expect.arrayContaining([
        'qaapi.lamundialdeseguros.com',
        'sys2000.lamundialdeseguros.com',
        'qasys2000.lamundialdeseguros.com',
        '*.lamundialdeseguros.com',
        '*.exelixitech.com',
      ]),
    );
    expect(pol.hostsHttp).toEqual([]);
    expect(pol.timeoutMs).toBe(30000);
    expect(validarUrlAdjunto('https://qaapi.lamundialdeseguros.com/sis2000/poliza/1/2026/11/', pol)).toMatchObject({
      acceso: 'exacta',
    });
    expect(validarUrlAdjunto('https://pagos.exelixitech.com/a.pdf', pol)).toMatchObject({ acceso: 'comodin' });
    expect(validarUrlAdjunto('https://exelixitech.com.evil.io/a.pdf', pol)).toEqual({
      error: 'host no permitido (exelixitech.com.evil.io)',
    });
    expect(validarUrlAdjunto('https://notexelixitech.com/a.pdf', pol)).toHaveProperty('error');
  });

  it('rechaza http, otros protocolos, credenciales e IPs literales no listadas', () => {
    const pol = politica();
    expect(validarUrlAdjunto('http://qaapi.lamundialdeseguros.com/a.pdf', pol)).toHaveProperty('error');
    expect(validarUrlAdjunto('ftp://qaapi.lamundialdeseguros.com/a.pdf', pol)).toHaveProperty('error');
    expect(validarUrlAdjunto('file:///etc/passwd', pol)).toHaveProperty('error');
    expect(validarUrlAdjunto('https://u:p@qaapi.lamundialdeseguros.com/a.pdf', pol)).toHaveProperty('error');
    expect(validarUrlAdjunto('https://169.254.169.254/latest', pol)).toHaveProperty('error');
    expect(validarUrlAdjunto('https://localhost/a.pdf', pol)).toHaveProperty('error');
  });

  it('http solo para el host exacto de la API PDF si ese ambiente la configura en http', () => {
    const pol = politica({ POLICY_PDF_URL: 'http://api2.lamundialdeseguros.com/sis2000/poliza' });
    expect(pol.hostsHttp).toEqual(['api2.lamundialdeseguros.com']);
    expect(validarUrlAdjunto('http://api2.lamundialdeseguros.com/sis2000/poliza/1/', pol)).toMatchObject({
      acceso: 'exacta',
    });
    expect(validarUrlAdjunto('http://qaapi.lamundialdeseguros.com/a.pdf', pol)).toHaveProperty('error');
  });

  it('MAIL_ATTACHMENT_URL_HOSTS reemplaza los comodines pero siempre suma los hosts propios de PDFs', () => {
    const pol = politica({ MAIL_ATTACHMENT_URL_HOSTS: 'docs.ejemplo.com, 10.1.1.9' });
    expect(pol.hosts).toContain('docs.ejemplo.com');
    expect(pol.hosts).toContain('qaapi.lamundialdeseguros.com');
    expect(pol.hosts).not.toContain('*.exelixitech.com');
    expect(validarUrlAdjunto('https://10.1.1.9/a.pdf', pol)).toMatchObject({ acceso: 'exacta' });
  });

  it('IPs privadas, locales y mapeadas', () => {
    for (const ip of ['127.0.0.1', '10.2.3.4', '172.20.0.1', '192.168.8.80', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1', '0.0.0.0']) {
      expect(esIpPrivada(ip)).toBe(true);
    }
    for (const ip of ['200.44.32.12', '8.8.8.8', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
      expect(esIpPrivada(ip)).toBe(false);
    }
  });

  it('redirección hacia un host no permitido: se rechaza', async () => {
    const fetchFn = jest.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } }),
    );
    await expect(
      descargarAdjuntoUrl('https://qaapi.lamundialdeseguros.com/a.pdf', politica(), {
        fetchFn: fetchFn as never,
        lookupFn: publica,
      }),
    ).rejects.toThrow('host no permitido');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('redirección dentro de la lista blanca: se sigue', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/b.pdf' } }))
      .mockResolvedValueOnce(new Response('%PDF-1.4', { status: 200 }));
    const r = await descargarAdjuntoUrl('https://qaapi.lamundialdeseguros.com/a.pdf', politica(), {
      fetchFn: fetchFn as never,
      lookupFn: publica,
    });
    expect(r.content.toString()).toBe('%PDF-1.4');
    expect(fetchFn.mock.calls[1][0]).toBe('https://qaapi.lamundialdeseguros.com/b.pdf');
  });

  it('archivo mayor al tope: se rechaza (por cabecera y por bytes leídos)', async () => {
    const pol = { ...politica(), maxBytes: 10 };
    const grande = Buffer.alloc(11, 1);
    await expect(
      descargarAdjuntoUrl('https://qaapi.lamundialdeseguros.com/a.pdf', pol, {
        fetchFn: (async () => new Response(new Uint8Array(grande))) as never,
      }),
    ).rejects.toThrow('archivo mayor');
    const sinLargo = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(6));
          c.enqueue(new Uint8Array(6));
          c.close();
        },
      }),
    );
    await expect(
      descargarAdjuntoUrl('https://qaapi.lamundialdeseguros.com/a.pdf', pol, {
        fetchFn: (async () => sinLargo) as never,
      }),
    ).rejects.toThrow('archivo mayor');
  });

  it('detecta pdf/xlsx/csv por contenido y rechaza lo demás', () => {
    const pk = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]);
    expect(detectarTipoAdjunto(Buffer.from('%PDF-1.7'), {})).toBe('application/pdf');
    expect(detectarTipoAdjunto(pk, { filename: 'a.xlsx' })).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(detectarTipoAdjunto(pk, { filename: 'a.pdf' })).toBeNull();
    expect(detectarTipoAdjunto(Buffer.from('a;b\n1;2'), { respuesta: 'text/csv' })).toBe('text/csv');
    expect(detectarTipoAdjunto(Buffer.from('<html>'), { filename: 'a.pdf' })).toBeNull();
    expect(detectarTipoAdjunto(Buffer.from([0x4d, 0x5a, 0, 0]), { filename: 'a.csv' })).toBeNull();
  });
});
