import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SendTemplatedMailDto } from './dto/send-templated-mail.dto';
import { MailService } from './mail.service';

describe('MailService: plantilla expediente-reporte-diario', () => {
  const svc = new MailService({ get: (_k: string, d?: unknown) => d } as never);
  const build = (data: Record<string, unknown>) =>
    (
      svc as unknown as {
        buildTemplate(dto: unknown): { subject: string; html: string; text: string } | { error: string };
      }
    ).buildTemplate({ to: 'a@test.com', template: 'expediente-reporte-diario', data });

  it('el DTO acepta la plantilla', () => {
    const dto = plainToInstance(SendTemplatedMailDto, {
      to: 'a@test.com',
      toExtra: ['b@test.com'],
      template: 'expediente-reporte-diario',
      data: { fecha: '09/11/2026' },
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('arma el reporte con los datos de Nexus y respeta el asunto', () => {
    const r = build({
      subject: 'Marketplace | Canales | Control documental diario – 09/11/2026',
      areas: 'Canales',
      fecha: '09/11/2026',
      corte: '09/11/2026 23:00',
      dia: { emitidas: 1, completas: 0, incompletas: 1 },
      polizas: [{ poliza: 'P-1', asegurado: 'L. · V-11•••333', observacion: 'Falta cédula' }],
    });
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.subject).toBe('Marketplace | Canales | Control documental diario – 09/11/2026');
    expect(r.html).toContain('N.º P-1');
    expect(r.text).toContain('Observación: Falta cédula');
  });

  it('sin datos no falla: reporte de control en cero', () => {
    const r = build({});
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.text).toContain('0 pendientes de la emisión del día');
  });
});
