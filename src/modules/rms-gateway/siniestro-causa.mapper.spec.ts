import { mapCieToCausa, resolverCcausa } from './siniestro-causa.mapper';

describe('siniestro-causa.mapper', () => {
  it('respeta ccausa si ya viene > 0', () => {
    expect(
      resolverCcausa({ ccausa: 1001, cdEnfermedad: 'Z25', cdMotivo: 'APS' }),
    ).toBe(1001);
  });

  it('APS + Z25 → causa APS default (13)', () => {
    expect(
      resolverCcausa({ ccausa: 0, cdEnfermedad: 'Z25', cdMotivo: 'APS' }),
    ).toBe(13);
  });

  it('EMERG + I21 → 1001', () => {
    expect(mapCieToCausa('I21.0', 7)).toBe(1001);
  });

  it('usa cramo de póliza sobre motivo', () => {
    expect(
      resolverCcausa({
        ccausa: 0,
        cdEnfermedad: 'Z25',
        cdMotivo: 'APS',
        cramoPoliza: 7,
      }),
    ).toBe(1000);
  });
});
