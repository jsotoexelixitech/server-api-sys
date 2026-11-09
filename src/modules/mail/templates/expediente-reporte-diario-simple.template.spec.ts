import {
  buildExpedienteReporteSimpleEmail,
  LINEA_EXCEL,
  normalizarReporteSimple,
} from './expediente-reporte-diario-simple.template';

const build = (raw: Record<string, unknown>) =>
  buildExpedienteReporteSimpleEmail(normalizarReporteSimple(raw));

describe('plantilla expediente-reporte-diario-simple', () => {
  it('cuatro cifras, corte y la línea del Excel; nada más', () => {
    const r = build({
      subject: 'Marketplace | Canales | Control documental diario – 09/11/2026',
      fecha: '09/11/2026',
      corte: '09/11/2026 23:00',
      completados: 120,
      incompletos: 35,
      canales: { completos: 100, incompletos: 30 },
      productores: { completos: 20, incompletos: 5 },
      sinDatos: 0,
    });
    expect(r.subject).toBe('Marketplace | Canales | Control documental diario – 09/11/2026');
    expect(r.text).toContain('Control documental diario – 09/11/2026');
    expect(r.text).toContain('Corte: 09/11/2026 23:00 (hora de Caracas)');
    expect(r.text).toContain('Completados: 120');
    expect(r.text).toContain('Incompletos: 35');
    expect(r.text).toContain('De canales: 100 completos / 30 incompletos');
    expect(r.text).toContain('De productores: 20 completos / 5 incompletos');
    expect(r.text).toContain(LINEA_EXCEL);
    expect(r.text).not.toContain('Sin datos de canal o productor');
    const todo = `${r.html}\n${r.text}`.toLowerCase();
    expect(todo).not.toMatch(/vendedor|monitor|conciliaci|entregabilidad|href=/);
  });

  it('sin datos de canal o productor solo si hay; caso cero', () => {
    const r = build({ fecha: '09/11/2026', completados: 4, incompletos: 0, sinDatos: 2 });
    expect(r.text).toContain('Sin datos de canal o productor: 2');
    expect(r.text).toContain('Incompletos: 0');
    expect(r.html).toContain('0 incompletos');
    expect(r.subject).toBe('Marketplace | Canales | Control documental diario – 09/11/2026');
  });

  it('sin adjunto no menciona el Excel; con filas recortadas lo avisa', () => {
    expect(build({ adjunto: false }).text).not.toContain('Excel');
    const r = build({ omitidas: { incompletos: 10, completados: 300 } });
    expect(r.text).toContain(
      'Por tamaño, el Excel no incluye 10 pólizas incompletas (las más antiguas) ni 300 pólizas completadas.',
    );
  });

  it('escapa y descarta textos raros', () => {
    const r = build({ subject: '<b>x</b>', corte: '<script>' });
    expect(r.html).not.toContain('<b>x</b>');
    expect(r.html).not.toContain('<script>');
  });
});
