import { buildLamundialBrandedEmail } from './lamundial-branded.template';

const base = {
  subject: 'Asunto',
  eyebrow: 'La Mundial de Seguros',
  title: 'Título',
  intro: 'Introducción única del correo',
  fields: [{ label: 'Emitidas hoy', value: '3' }],
};

const veces = (html: string, txt: string) => html.split(txt).length - 1;

describe('lamundial-branded', () => {
  it('por defecto la introducción sale arriba y dentro de la tarjeta (sin cambios)', () => {
    const { html } = buildLamundialBrandedEmail(base);
    expect(veces(html, base.intro)).toBe(2);
  });

  it('introArriba false: la introducción sale una sola vez', () => {
    const { html } = buildLamundialBrandedEmail({ ...base, introArriba: false });
    expect(veces(html, base.intro)).toBe(1);
    expect(html).toContain('Emitidas hoy');
  });
});
