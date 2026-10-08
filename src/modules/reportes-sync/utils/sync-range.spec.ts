import { diasDelRango, partirRango, tramosParaRango } from './sync-range';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const ymd = (x: Date) => x.toISOString().slice(0, 10);

describe('diasDelRango', () => {
  it('cuenta ambos extremos', () => {
    expect(diasDelRango(d('2026-01-01'), d('2026-01-01'))).toBe(1);
    expect(diasDelRango(d('2026-01-01'), d('2026-01-31'))).toBe(31);
    expect(diasDelRango(d('2026-01-01'), d('2026-09-14'))).toBe(257);
  });
});

describe('tramosParaRango', () => {
  it('no parte rangos cortos ni sin fechas', () => {
    expect(tramosParaRango(d('2026-01-01'), d('2026-01-10'), 4)).toBe(1);
    expect(tramosParaRango(null, null, 4)).toBe(1);
    expect(tramosParaRango(d('2026-01-01'), undefined, 4)).toBe(1);
    expect(tramosParaRango(d('2026-02-01'), d('2026-01-01'), 4)).toBe(1);
  });

  it('crece con los días y respeta el máximo', () => {
    expect(tramosParaRango(d('2026-01-01'), d('2026-01-31'), 4)).toBe(2); // 31 días / 15
    expect(tramosParaRango(d('2026-01-01'), d('2026-03-31'), 4)).toBe(4); // 90 días / 15 = 6 → tope 4
    expect(tramosParaRango(d('2026-01-01'), d('2026-03-31'), 2)).toBe(2);
  });

  it('con máximo 1 nunca parte (paralelismo desactivado)', () => {
    expect(tramosParaRango(d('2026-01-01'), d('2026-12-31'), 1)).toBe(1);
  });
});

describe('partirRango', () => {
  it('cubre el rango exacto, sin huecos ni traslapes', () => {
    const desde = d('2026-01-01');
    const hasta = d('2026-09-14');
    for (const n of [2, 3, 4, 5, 7]) {
      const partes = partirRango(desde, hasta, n);
      expect(partes).toHaveLength(n);
      expect(ymd(partes[0].desde)).toBe('2026-01-01');
      expect(ymd(partes[partes.length - 1].hasta)).toBe('2026-09-14');
      let dias = 0;
      for (let i = 0; i < partes.length; i += 1) {
        dias += diasDelRango(partes[i].desde, partes[i].hasta);
        if (i > 0) {
          // el tramo siguiente empieza el día después de que termina el anterior
          expect(partes[i].desde.getTime() - partes[i - 1].hasta.getTime()).toBe(24 * 60 * 60 * 1000);
        }
      }
      expect(dias).toBe(diasDelRango(desde, hasta));
    }
  });

  it('reparte el sobrante en los primeros tramos', () => {
    const partes = partirRango(d('2026-01-01'), d('2026-01-10'), 3); // 10 días → 4,3,3
    expect(partes.map((p) => diasDelRango(p.desde, p.hasta))).toEqual([4, 3, 3]);
  });

  it('con un tramo, o más tramos que días, devuelve algo consistente', () => {
    expect(partirRango(d('2026-01-01'), d('2026-01-31'), 1)).toHaveLength(1);
    expect(partirRango(d('2026-01-01'), d('2026-01-03'), 10)).toHaveLength(3);
  });
});
