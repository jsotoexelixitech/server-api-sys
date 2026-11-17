import {
  asuntoExpediente,
  buildExpedienteDocumentosEmail,
  enlaceSeguro,
  EXPEDIENTE_TIPOS,
  normalizarDocumentos,
  normalizarPolizas,
} from './expediente-documentos.template';

const ENLACE = 'https://nexusqa.exelixitech.com/portal-lm/expediente?t=abc123';
const POLIZA = '18-27-0000137414';

const solicitud = () =>
  buildExpedienteDocumentosEmail({
    tipo: 'solicitud',
    nombre: 'José',
    polizas: [POLIZA],
    documentos: [
      { nombre: 'Cédula de identidad', estado: 'aprobado' },
      { nombre: 'Licencia de conducir', estado: 'pendiente' },
      { nombre: 'Certificado de circulación', estado: 'pendiente' },
    ],
    enlace: ENLACE,
  });

function todos(enlace?: string) {
  return EXPEDIENTE_TIPOS.map((tipo) =>
    buildExpedienteDocumentosEmail({
      tipo,
      nombre: 'Ana',
      polizas: [POLIZA],
      documentos: [
        { nombre: 'Cédula de identidad', estado: 'pendiente' },
        { nombre: 'Licencia de conducir', estado: 'corregir', motivo: 'La licencia está vencida.' },
        { nombre: 'Certificado de circulación', estado: 'recibido' },
      ],
      enlace,
    }),
  );
}

describe('plantilla expediente-documentos (texto oficial La Mundial)', () => {
  it('solicitud: texto oficial, lista simple de pendientes y botón', () => {
    const r = solicitud();
    expect(r.subject).toBe(
      `La Mundial de Seguros | Complete la documentación de su póliza N.º ${POLIZA}`,
    );
    expect(r.text).toContain('Estimado(a) José:');
    expect(r.text).toContain('Reciba un cordial saludo de La Mundial de Seguros.');
    expect(r.text).toContain(
      `Le confirmamos que su póliza N.º ${POLIZA} ha sido emitida exitosamente.`,
    );
    expect(r.text).toContain('- Licencia de conducir.\n- Certificado de circulación.');
    expect(r.text).not.toContain('Cédula de identidad');
    expect(r.text).toContain('Es importante que complete este proceso a la brevedad, ya que');
    expect(r.text).toContain('¿Ya entregó estos documentos a La Mundial de Seguros?');
    expect(r.text).toContain('Esta gestión no afecta la emisión de su póliza.');
    expect(r.text).toContain('Atentamente,\nLa Mundial de Seguros');
    expect(r.text).toContain(
      'No requiere responder a este correo; puede completar la gestión a través del enlace indicado.',
    );
    expect(r.html).toContain('Completar mi expediente');
    expect(r.html).toContain('Si el botón no funciona, copie y pegue este enlace en su navegador');
    expect(r.html).toContain('max-width:600px');
    expect(r.text).not.toMatch(/<[a-z]/i);
  });

  it('la póliza y «ha sido emitida exitosamente» van en negrita', () => {
    const r = solicitud();
    const num = `<span style="white-space:nowrap">N\\.º ${POLIZA}</span>`;
    expect(r.html).toMatch(
      new RegExp(`<(strong|b)[^>]*>${num} ha sido emitida exitosamente</(strong|b)>`),
    );
    expect(r.html).toMatch(
      /<(strong|b)[^>]*>Es importante que complete este proceso a la brevedad<\//,
    );
    for (const r2 of todos(ENLACE)) {
      // En los 5 correos la póliza va en negrita y el número no se parte.
      expect(r2.html).toMatch(new RegExp(`<(strong|b)[^>]*>${num}[^<]*</(strong|b)>`));
    }
  });

  it('documento observado: motivo corto entre paréntesis', () => {
    const [sol, , obs] = todos(ENLACE);
    expect(sol.text).toContain('- Licencia de conducir (La licencia está vencida).');
    expect(obs.text).toContain('- Licencia de conducir (La licencia está vencida).');
    expect(obs.text).toContain('cargue nuevamente el siguiente documento');
  });

  it('recordatorio: mismo cuerpo y «Recordatorio:» delante del asunto', () => {
    const [sol, rec] = todos(ENLACE);
    expect(rec.subject).toBe(`Recordatorio: ${sol.subject}`);
    expect(rec.text).toBe(sol.text);
  });

  it('varias pólizas: plural y documentos por póliza', () => {
    const r = buildExpedienteDocumentosEmail({
      tipo: 'solicitud',
      nombre: 'Ana',
      polizas: ['P-1', 'P-2'],
      documentos: [
        { nombre: 'Licencia de conducir', estado: 'pendiente', poliza: 'P-1' },
        { nombre: 'Certificado de circulación', estado: 'pendiente', poliza: 'P-2' },
      ],
      enlace: ENLACE,
    });
    expect(r.subject).toContain('sus pólizas N.º P-1 y N.º P-2');
    expect(r.text).toContain(
      'Le confirmamos que sus pólizas N.º P-1 y N.º P-2 han sido emitidas exitosamente.',
    );
    expect(r.text).toContain('Póliza N.º P-1:\n- Licencia de conducir.');
    expect(r.text).toContain('Póliza N.º P-2:\n- Certificado de circulación.');
  });

  it('de usted: sin tuteo ni «vendedor» en ningún correo', () => {
    for (const enlace of [ENLACE, undefined]) {
      for (const r of todos(enlace)) {
        const all = `${r.subject}\n${r.html}\n${r.text}`;
        expect(all).not.toMatch(
          /\btu\s|\btus\s|envíanos|Toma una foto|Subir mis|\bpuedes\b|\bnecesitas\b/i,
        );
        expect(all.toLowerCase()).not.toContain('vendedor');
        expect(r.text).toContain('Atentamente,\nLa Mundial de Seguros');
        expect(r.text).toContain('sistema de control documental');
      }
    }
  });

  it('sin vencimiento, sin pasos y sin nota de asesor', () => {
    expect(solicitud().html).not.toMatch(/vence|Cómo hacerlo|asesor/i);
  });

  it('escapa todo lo que viene en data', () => {
    const r = buildExpedienteDocumentosEmail({
      tipo: 'observado',
      nombre: '<script>x</script>',
      polizas: ['"><img src=x>'],
      documentos: [{ nombre: '<b>doc</b>', estado: 'corregir', motivo: '<i>m</i>' }],
      enlace: ENLACE,
    });
    expect(r.html).not.toContain('<script>');
    expect(r.html).not.toContain('<img src=x>');
    expect(r.html).not.toContain('<b>doc</b>');
    expect(r.html).not.toContain('<i>m</i>');
  });

  it('sin enlace o con esquema inseguro no hay botón y el pie no menciona el enlace', () => {
    for (const enlace of [undefined, 'javascript:alert(1)']) {
      const r = buildExpedienteDocumentosEmail({ tipo: 'recordatorio', nombre: 'Ana', enlace });
      expect(r.html).not.toContain('Completar mi expediente');
      expect(r.html).not.toContain('javascript:');
      expect(r.text).toContain('No requiere responder a este correo.');
    }
  });

  it('recibido y completo no llevan botón aunque llegue enlace', () => {
    const [, , , rec, comp] = todos(ENLACE);
    for (const r of [rec, comp]) expect(r.html).not.toContain('Completar mi expediente');
    expect(rec.text).toContain('recibimos el documento Certificado de circulación');
  });

  it('normaliza documentos y pólizas', () => {
    const docs = normalizarDocumentos([
      { nombre: 'A', estado: 'raro', motivo: 'no va' },
      { nombre: '' },
      null,
      ...Array.from({ length: 40 }, (_, i) => ({ nombre: `D${i}`, estado: 'aprobado' })),
    ]);
    expect(docs[0]).toEqual({ nombre: 'A', estado: 'pendiente' });
    expect(docs.length).toBeLessThanOrEqual(30);
    expect(normalizarPolizas(undefined, 'N° P-1, P-2')).toEqual(['P-1', 'P-2']);
    expect(asuntoExpediente('completo', [])).toBe(
      'La Mundial de Seguros | Expediente completo de su póliza',
    );
    expect(enlaceSeguro('data:text/html,1')).toBe('');
  });
});
