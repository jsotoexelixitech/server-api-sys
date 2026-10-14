import { debeFrenarReemplazo } from './sync-guard';

const base = { reemplazoCompleto: true, sinBorrado: false };

describe('debeFrenarReemplazo', () => {
  it('frena si se borran muchas filas y entra menos de la mitad', () => {
    expect(debeFrenarReemplazo({ ...base, borradas: 3000, escritas: 40 })).toBe(true);
    expect(debeFrenarReemplazo({ ...base, borradas: 3000, escritas: 0 })).toBe(true);
    expect(debeFrenarReemplazo({ ...base, borradas: 3000, escritas: 1499 })).toBe(true);
  });

  it('no frena si entra la mitad o más (variación normal)', () => {
    expect(debeFrenarReemplazo({ ...base, borradas: 3000, escritas: 1500 })).toBe(false);
    expect(debeFrenarReemplazo({ ...base, borradas: 3000, escritas: 3400 })).toBe(false);
  });

  it('no evalúa tablas chicas (100 filas o menos)', () => {
    expect(debeFrenarReemplazo({ ...base, borradas: 100, escritas: 0 })).toBe(false);
    expect(debeFrenarReemplazo({ ...base, borradas: 101, escritas: 0 })).toBe(true);
  });

  it('solo aplica al reemplazo completo, no a ventanas con rango de fechas', () => {
    expect(debeFrenarReemplazo({ ...base, reemplazoCompleto: false, borradas: 3000, escritas: 0 })).toBe(false);
  });

  it('no aplica cuando la sincronización no borra', () => {
    expect(debeFrenarReemplazo({ ...base, sinBorrado: true, borradas: 3000, escritas: 0 })).toBe(false);
  });
});
