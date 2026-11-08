import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SendTemplatedMailDto } from './dto/send-templated-mail.dto';
import { MailService } from './mail.service';

describe('MailService: plantilla expediente-documentos', () => {
  const svc = new MailService({ get: (_k: string, d?: unknown) => d } as never);
  const build = (data: Record<string, unknown>) =>
    (svc as unknown as { buildTemplate(dto: unknown): { subject: string; html: string } | { error: string } })
      .buildTemplate({ to: 'a@test.com', template: 'expediente-documentos', data });

  it('el DTO acepta la plantilla nueva', () => {
    const dto = plainToInstance(SendTemplatedMailDto, {
      to: 'a@test.com',
      template: 'expediente-documentos',
      data: { tipo: 'solicitud' },
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('arma el correo con los datos de Nexus y respeta el asunto recibido', () => {
    const r = build({
      tipo: 'observado',
      subject: '[Prueba QA] La Mundial de Seguros | Necesitamos corregir un documento de su póliza N.º P-1',
      nombre: 'Luis',
      polizas: ['P-1'],
      documentos: [{ nombre: 'Licencia de conducir', estado: 'corregir', motivo: 'Está vencida.' }],
      enlace: 'https://portal.test/expediente?t=x',
    });
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.subject).toBe('[Prueba QA] La Mundial de Seguros | Necesitamos corregir un documento de su póliza N.º P-1');
    expect(r.html).toContain('Licencia de conducir (Está vencida).');
    expect(r.html).toContain('Completar mi expediente');
  });

  it('acepta poliza en texto (compatibilidad)', () => {
    const r = build({ tipo: 'completo', nombre: 'Ana', poliza: 'P-9' });
    expect('error' in r ? r.error : r.html).toMatch(/<strong[^>]*>N\.º P-9<\/strong>/);
  });

  it('sin asunto usa el del tipo', () => {
    const r = build({ tipo: 'completo', nombre: 'Ana' });
    expect('error' in r ? r.error : r.subject).toBe('La Mundial de Seguros | Expediente completo de su póliza');
  });
});
