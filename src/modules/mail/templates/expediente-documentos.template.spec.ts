import {
  buildExpedienteDocumentosEmail,
  enlaceSeguro,
  formatoVence,
  normalizarDocumentos,
} from './expediente-documentos.template';

const ENLACE = 'https://nexusqa.exelixitech.com/portal-lm/expediente?t=abc123';

describe('plantilla expediente-documentos', () => {
  it('solicitud: saludo, póliza en negrita, documentos con estado, botón, vence y pasos', () => {
    const r = buildExpedienteDocumentosEmail({
      tipo: 'solicitud',
      nombre: 'Luis',
      poliza: '18-1-0000078926',
      documentos: [
        { nombre: 'Cédula de identidad', estado: 'pendiente' },
        { nombre: 'Licencia de conducir', estado: 'corregir', motivo: 'La licencia está vencida.' },
        { nombre: 'Certificado de circulación', estado: 'en_revision' },
        { nombre: 'RIF', estado: 'aprobado' },
      ],
      enlace: ENLACE,
      venceEn: '2026-11-14T15:00:00.000Z',
    });
    expect(r.subject).toBe('La Mundial | Completa la documentación de tu póliza');
    expect(r.html).toContain('Hola <strong>Luis</strong>');
    expect(r.html).toMatch(/tu póliza <strong[^>]*>N° 18-1-0000078926<\/strong>/);
    expect(r.html).toContain('Pendiente');
    expect(r.html).toContain('Envíalo de nuevo');
    expect(r.html).toContain('En revisión');
    expect(r.html).toContain('Aprobado');
    expect(r.html).toContain('La licencia está vencida.');
    expect(r.html).toContain('Subir mis documentos');
    expect(r.html).toContain('noviembre de 2026');
    expect(r.html).toContain('Toma una foto o elige el archivo');
    expect(r.html).toContain('asesor de seguros');
    expect(r.html).toContain('max-width:600px');
    expect(r.text).toContain('- Licencia de conducir: Envíalo de nuevo');
    expect(r.text).toContain(`Subir mis documentos: ${ENLACE}`);
    expect(r.text).not.toMatch(/<[a-z]/i);
  });

  it('cada mensaje sale una sola vez', () => {
    const r = buildExpedienteDocumentosEmail({
      tipo: 'solicitud',
      nombre: 'Luis',
      poliza: 'P-1',
      documentos: [{ nombre: 'Cédula de identidad', estado: 'pendiente' }],
      enlace: ENLACE,
    });
    const veces = (s: string, sub: string) => s.split(sub).length - 1;
    expect(veces(r.html, 'Ya emitimos')).toBe(1);
    expect(veces(r.html, 'asesor de seguros')).toBe(1);
    expect(veces(r.html, 'Mensaje automático')).toBe(1);
    expect(veces(r.text, 'Ya emitimos')).toBe(1);
  });

  it('ningún tipo dice «vendedor»', () => {
    for (const tipo of ['solicitud', 'recordatorio', 'observado', 'recibido', 'completo'] as const) {
      for (const enlace of [ENLACE, undefined]) {
        const r = buildExpedienteDocumentosEmail({
          tipo,
          nombre: 'Ana',
          poliza: 'P-1',
          documentos: [{ nombre: 'Cédula de identidad', estado: 'pendiente' }],
          enlace,
        });
        expect(`${r.subject} ${r.html} ${r.text}`.toLowerCase()).not.toContain('vendedor');
      }
    }
  });

  it('escapa todo lo que viene en data', () => {
    const r = buildExpedienteDocumentosEmail({
      tipo: 'observado',
      nombre: '<script>x</script>',
      poliza: '"><img src=x>',
      documentos: [{ nombre: '<b>doc</b>', estado: 'corregir', motivo: '<i>m</i>' }],
      enlace: ENLACE,
    });
    expect(r.html).not.toContain('<script>');
    expect(r.html).not.toContain('<img src=x>');
    expect(r.html).not.toContain('<b>doc</b>');
    expect(r.html).not.toContain('<i>m</i>');
    expect(r.html).toContain('&lt;script&gt;');
  });

  it('sin enlace o con esquema inseguro no hay botón ni pasos', () => {
    for (const enlace of [undefined, 'javascript:alert(1)']) {
      const r = buildExpedienteDocumentosEmail({
        tipo: 'recordatorio',
        nombre: 'Ana',
        documentos: [{ nombre: 'Cédula de identidad', estado: 'pendiente' }],
        enlace,
      });
      expect(r.html).not.toContain('Subir mis documentos');
      expect(r.html).not.toContain('javascript:');
      expect(r.html).toContain('Puedes entregarlos a tu asesor de seguros');
    }
  });

  it('recibido y completo no llevan botón aunque llegue enlace', () => {
    for (const tipo of ['recibido', 'completo'] as const) {
      const r = buildExpedienteDocumentosEmail({ tipo, nombre: 'Ana', poliza: 'P-1', enlace: ENLACE });
      expect(r.html).not.toContain('Subir mis documentos');
    }
  });

  it('varias pólizas: plural y póliza en cada documento', () => {
    const r = buildExpedienteDocumentosEmail({
      tipo: 'recordatorio',
      nombre: 'Ana',
      poliza: 'P-1, P-2',
      documentos: [
        { nombre: 'Cédula de identidad', estado: 'pendiente', poliza: 'P-1' },
        { nombre: 'Licencia de conducir', estado: 'pendiente', poliza: 'P-2' },
      ],
    });
    expect(r.html).toMatch(/tus pólizas <strong[^>]*>P-1, P-2<\/strong>/);
    expect(r.html).toContain('Póliza P-2');
  });

  it('normaliza documentos: estado desconocido = pendiente, motivo solo al corregir, tope 30', () => {
    const docs = normalizarDocumentos([
      { nombre: 'A', estado: 'raro', motivo: 'no va' },
      { nombre: '' },
      null,
      ...Array.from({ length: 40 }, (_, i) => ({ nombre: `D${i}`, estado: 'aprobado' })),
    ]);
    expect(docs[0]).toEqual({ nombre: 'A', estado: 'pendiente' });
    expect(docs.length).toBeLessThanOrEqual(30);
  });

  it('helpers de enlace y fecha', () => {
    expect(enlaceSeguro('http://a.test/x')).toBe('http://a.test/x');
    expect(enlaceSeguro('data:text/html,1')).toBe('');
    expect(formatoVence('no-fecha')).toBe('');
    expect(formatoVence('2026-11-14T15:00:00.000Z')).toMatch(/14/);
  });
});
