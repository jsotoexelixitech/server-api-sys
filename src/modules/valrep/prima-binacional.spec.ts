import { sumPrimaBinacional } from './prima-binacional';

describe('prima RCV Binacional', () => {
  // Plan BINAC: RC (60) + APOV por puesto (67 = 3,00 · 68 = 0,80 · 69 = 1,45).
  const detalle = (puestos: number) => [
    { ccobertura: '60', prima: 100 },
    { ccobertura: '67', prima: 3 * puestos },
    { ccobertura: '68', prima: 0.8 * puestos },
    { ccobertura: '69', prima: 1.45 * puestos },
  ];

  it('suma todas las coberturas, incluida la 69 (igual que la emisión)', () => {
    expect(sumPrimaBinacional(detalle(1))).toBe(105.25);
    expect(sumPrimaBinacional(detalle(3))).toBe(115.75);
  });

  it('cada puesto adicional agrega 5,25', () => {
    expect(
      Math.round((sumPrimaBinacional(detalle(3)) - sumPrimaBinacional(detalle(1))) * 100) / 100,
    ).toBe(10.5);
  });

  it('acepta primas como texto o nulas (NUMERIC del SP) y redondea a 2 decimales', () => {
    expect(
      sumPrimaBinacional([{ prima: '10.005' }, { prima: null }, { prima: undefined }, { prima: 'x' }, { prima: 20.001 }]),
    ).toBe(30.01);
  });

  it('sin detalle devuelve 0', () => {
    expect(sumPrimaBinacional([])).toBe(0);
  });
});
