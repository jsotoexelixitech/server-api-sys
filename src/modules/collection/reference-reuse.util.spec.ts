import { evaluateReferenceReuse } from './reference-reuse.util';

describe('evaluateReferenceReuse', () => {
  const base = { ctenedor: 100, mpago: 1000, movementAmount: 1000 };

  it('acepta una referencia sin cobros previos', () => {
    expect(evaluateReferenceReuse({ ...base, prior: [] })).toEqual({ ok: true });
  });

  it('rechaza si la referencia ya cobró a otro asegurado', () => {
    const r = evaluateReferenceReuse({ ...base, prior: [{ casegurado: 200, mpago: 1000 }] });
    expect(r).toMatchObject({ ok: false, reason: 'OTHER_PAYER' });
  });

  it('rechaza si algún cobro previo es de otro asegurado aunque otro sea del mismo', () => {
    const r = evaluateReferenceReuse({
      ...base,
      prior: [{ casegurado: 100, mpago: 10 }, { casegurado: 200, mpago: 10 }],
    });
    expect(r).toMatchObject({ ok: false, reason: 'OTHER_PAYER' });
  });

  it('rechaza si lo cobrado más este cobro supera el movimiento', () => {
    const r = evaluateReferenceReuse({ ...base, prior: [{ casegurado: 100, mpago: 1000 }] });
    expect(r).toMatchObject({ ok: false, reason: 'AMOUNT_EXCEEDED' });
  });

  it('acepta mismo asegurado si el total cabe en el movimiento (con tolerancia)', () => {
    const r = evaluateReferenceReuse({
      ctenedor: 100,
      mpago: 400,
      movementAmount: 1000.01,
      prior: [{ casegurado: 100, mpago: 600 }],
    });
    expect(r).toEqual({ ok: true });
  });

  it('sin monto de movimiento conocido solo aplica la regla del asegurado', () => {
    const r = evaluateReferenceReuse({
      ctenedor: 100,
      mpago: 400,
      movementAmount: null,
      prior: [{ casegurado: 100, mpago: 9999 }],
    });
    expect(r).toEqual({ ok: true });
  });

  it('compara asegurados numéricamente aunque lleguen como texto', () => {
    const r = evaluateReferenceReuse({
      ...base,
      prior: [{ casegurado: '100' as unknown as number, mpago: 0 }],
    });
    expect(r).toEqual({ ok: true });
  });
});
