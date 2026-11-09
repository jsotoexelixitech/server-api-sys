import {
  buildExpedienteReporteDiarioEmail,
  estadoConciliacion,
  normalizarReporteDiario,
  protegerAsegurado,
  REPORTE_MAX_FILAS,
} from './expediente-reporte-diario.template';

const ENLACE = 'https://nexusqa.exelixitech.com/portal-lm/monitor-expedientes?tab=incompletos';

const fila = (poliza: string, extra: Record<string, unknown> = {}) => ({
  poliza,
  asegurado: 'M. P. · V-12•••678',
  producto: 'RCV',
  emitidaPor: 'Farmatodo',
  observacion: 'Falta licencia',
  dias: 0,
  intentos: 1,
  ultimoResultado: 'Enviado',
  noEnviar: false,
  siguienteAccion: 'Recordatorio el 12/11/2026',
  ...extra,
});

const base = (extra: Record<string, unknown> = {}) => ({
  subject: 'Marketplace | Canales | Control documental diario – 09/11/2026',
  areas: 'Canales',
  fecha: '09/11/2026',
  corte: '09/11/2026 23:00',
  dia: { emitidas: 5, completas: 3, incompletas: 2, sinDatos: 0 },
  distribucion: { faltantes: 2, ilegibles: 1, inconsistentes: 0, porValidar: 1 },
  polizas: [
    fila('18-27-0000137414'),
    fila('18-27-0000137415', {
      asegurado: 'J. R. · E-84•••221',
      observacion: 'Licencia ilegible',
      noEnviar: true,
      ultimoResultado: 'Excluido',
      siguienteAccion: 'Excluido de correos',
    }),
  ],
  polizasRestantes: 0,
  cartera: {
    total: 1234,
    completos: 800,
    incompletos: 400,
    sinDatos: 34,
    desglose: [
      { label: 'Con errores', valor: 150 },
      { label: 'Faltan documentos', valor: 250 },
    ],
  },
  historicos: { anteriores: 398, sinRespuesta: 40, sinCorreoValido: 12, noEnviar: 3 },
  conciliacion: { emisionesNexus: 6, enMonitor: 5, noPasaronOcr: 1, sinVinculo: 0 },
  entregabilidad: { intentos: 9, entregados: 8, conError: 1, sinCorreo: 2, bloqueados: 0, excluidos: 1 },
  tecnicos: { documentosNoLeidos: 2, fallasTecnicas: 0 },
  enlace: ENLACE,
  ...extra,
});

const render = (extra: Record<string, unknown> = {}) =>
  buildExpedienteReporteDiarioEmail(normalizarReporteDiario(base(extra)));

describe('plantilla expediente-reporte-diario', () => {
  it('con filas: asunto, cifras, listado completo y botón al detalle', () => {
    const r = render();
    expect(r.subject).toBe('Marketplace | Canales | Control documental diario – 09/11/2026');
    expect(r.text).toContain('Corte: 09/11/2026 23:00 (hora de Caracas)');
    expect(r.text).toContain('- Emitidas hoy: 5\n- Completas: 3\n- Incompletas: 2');
    expect(r.text).toContain('- Faltantes: 2\n- Ilegibles: 1\n- Inconsistentes: 0\n- Por validar: 1');
    expect(r.text).toContain('PÓLIZAS INCOMPLETAS DE HOY (2)');
    expect(r.text).toContain('1. N.º 18-27-0000137414 · RCV · Hoy');
    expect(r.text).toContain('Asegurado: M. P. · V-12•••678 · Emitida por: Farmatodo');
    expect(r.text).toContain(
      'Intentos: 1 · Último resultado: Excluido · No enviar correos: Sí',
    );
    expect(r.text).toContain('Siguiente acción: Recordatorio el 12/11/2026');
    expect(r.text).toContain('- Total: 1.234');
    expect(r.text).toContain('- Completas: 800 (64,8 %)');
    expect(r.text).toContain('- Incompletas: con errores: 150');
    expect(r.text).toContain('- Sin respuesta tras todos los recordatorios: 40');
    expect(r.text).toContain('- Sin correo válido del asegurado: 12');
    expect(r.text).toContain('- Estado: Cuadrada');
    expect(r.text).toContain('- Documentos que no se pudieron leer: 2');
    expect(r.text).not.toContain(ENLACE);
    expect(r.text.toLowerCase()).not.toContain('monitor');
    expect(r.text).not.toContain('0 pendientes de la emisión del día');

    expect(r.html).toContain('N.º 18-27-0000137414');
    expect(r.html).toContain('Emitida por: Farmatodo');
    expect(r.html).toContain('No enviar correos: Sí');
    expect(r.html).not.toContain(ENLACE);
    expect(r.html.toLowerCase()).not.toContain('monitor');
    expect(r.html).toContain('Asegurado protegido');
    // Nunca «vendedor» ni «Sin información».
    expect(`${r.html}${r.text}`).not.toMatch(/vendedor|sin información/i);
  });

  it('caso cero: bloque «0 pendientes de la emisión del día» con total y conciliación', () => {
    const r = render({
      dia: { emitidas: 4, completas: 4, incompletas: 0, sinDatos: 0 },
      polizas: [],
      conciliacion: { emisionesNexus: 5, enMonitor: 4, noPasaronOcr: 0, sinVinculo: 1 },
    });
    expect(r.text).toContain(
      '0 pendientes de la emisión del día. Total emitido: 4. Conciliación: Con diferencias: 1 póliza sin vínculo.',
    );
    expect(r.html).toContain('0 pendientes de la emisión del día');
    expect(r.html).toContain('Total emitido: <strong>4</strong>');
    expect(r.text).not.toContain('PÓLIZAS INCOMPLETAS DE HOY');
    expect(r.text).not.toContain('DOCUMENTOS PENDIENTES');
    // La cartera, los históricos y la conciliación salen igual.
    expect(r.text).toContain('PENDIENTES HISTÓRICOS');
    expect(r.text).toContain('CONCILIACIÓN DEL DÍA (TODAS LAS ÁREAS)');
  });

  it('escapa HTML en todo lo que llega y solo acepta enlaces http(s)', () => {
    const r = render({
      areas: '<b>Canales</b>',
      polizas: [fila('<img src=x onerror=alert(1)>', { observacion: '<script>alert(1)</script>' })],
      enlace: 'javascript:alert(1)',
    });
    expect(r.html).not.toContain('<script>');
    expect(r.html).not.toContain('<img src=x');
    expect(r.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(r.html).toContain('&lt;b&gt;Canales&lt;/b&gt;');
    expect(r.html).not.toContain('javascript:');
    expect(r.html).not.toContain('Ver detalle en el monitor');
  });

  it('valida y recorta: máx. 200 filas, cifras no negativas y asegurado protegido', () => {
    const muchas = Array.from({ length: REPORTE_MAX_FILAS + 7 }, (_, i) => fila(`P-${i}`));
    const p = normalizarReporteDiario({
      ...base(),
      polizas: [...muchas, { sinPoliza: true }],
      polizasRestantes: 10,
      dia: { emitidas: -3, completas: 'x', incompletas: 2.9 },
      fecha: '2026-11-09',
    });
    expect(p.polizas).toHaveLength(REPORTE_MAX_FILAS);
    expect(p.polizasRestantes).toBe(10 + 8);
    expect(p.dia).toEqual({ emitidas: 0, completas: 0, incompletas: 2, sinDatos: 0 });
    expect(p.fecha).toBe('');
    const r = buildExpedienteReporteDiarioEmail(p);
    expect(r.text).toContain('18 pólizas más están en el detalle del monitor.');
    expect(r.html).toContain('18 pólizas más están en el detalle del monitor.');
    // Gmail recorta por encima de ~102 KB: con 200 filas el HTML queda por debajo.
    expect(Buffer.byteLength(r.html, 'utf8')).toBeLessThan(100_000);

    expect(protegerAsegurado('María Pérez V-12345678 maria@correo.com')).toBe(
      'María Pérez V-12•••678 •••',
    );
    const crudo = normalizarReporteDiario({
      polizas: [fila('P-1', { asegurado: 'V-12345678', observacion: 'Escribir a ana@test.com' })],
    });
    expect(crudo.polizas[0].asegurado).toBe('V-12•••678');
    expect(crudo.polizas[0].observacion).toBe('Escribir a •••');
  });

  it('con textos largos el listado se corta antes del límite de Gmail y lo demás va al monitor', () => {
    const largas = Array.from({ length: REPORTE_MAX_FILAS }, (_, i) =>
      fila(`18-27-00001374${i}`, {
        emitidaPor: 'Canal alterno con un nombre muy largo '.repeat(3),
        observacion: 'Cédula: datos no coinciden con la póliza; falta licencia '.repeat(3),
      }),
    );
    const p = normalizarReporteDiario({ ...base(), polizas: largas, polizasRestantes: 5 });
    const r = buildExpedienteReporteDiarioEmail(p);
    expect(Buffer.byteLength(r.html, 'utf8')).toBeLessThan(100_000);
    const mostradas = (r.html.match(/<td class="a">/g) ?? []).length;
    expect(mostradas).toBeGreaterThan(50);
    expect(mostradas).toBeLessThan(REPORTE_MAX_FILAS);
    const resto = REPORTE_MAX_FILAS - mostradas + 5;
    expect(r.html).toContain(`${resto} pólizas más están en el detalle del monitor.`);
    expect(r.text).toContain(`${resto} pólizas más están en el detalle del monitor.`);
    expect(r.text).toContain(`PÓLIZAS INCOMPLETAS DE HOY (${REPORTE_MAX_FILAS + 5})`);
  });

  it('asunto por defecto y estado de conciliación', () => {
    const p = normalizarReporteDiario({ fecha: '09/11/2026' });
    expect(p.subject).toBe('Marketplace | Canales | Control documental diario – 09/11/2026');
    expect(estadoConciliacion(0)).toBe('Cuadrada');
    expect(estadoConciliacion(3)).toBe('Con diferencias: 3 pólizas sin vínculo');
  });
});
