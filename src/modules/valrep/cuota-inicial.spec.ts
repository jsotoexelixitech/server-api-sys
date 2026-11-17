import { parseCoberturasCuotaInicial, sumPrimaCuotaInicial } from './cuota-inicial';

describe('cuota inicial RCV', () => {
  // Detalle real de sp_calculo_auto_nexus (AutoIV, QA): Daños a personas con prima 0, Daños a cosas 36.98.
  const detalle = [
    { ccobertura: '6', ccoberturaint: '15', prima: 0 },
    { ccobertura: '7', ccoberturaint: '17', prima: 36.98 },
    { ccobertura: '8', ccoberturaint: '12', prima: 24.5 },
    { ccobertura: '15', ccoberturaint: '16', prima: 98 },
  ];

  it('por defecto toma Daños a personas (15) y Daños a cosas (17)', () => {
    expect([...parseCoberturasCuotaInicial(undefined)]).toEqual(['15', '17']);
    expect([...parseCoberturasCuotaInicial('  ')]).toEqual(['15', '17']);
    expect([...parseCoberturasCuotaInicial(' 15 , 17 ,')]).toEqual(['15', '17']);
  });

  it('suma solo la prima de esas coberturas', () => {
    expect(sumPrimaCuotaInicial(detalle, parseCoberturasCuotaInicial(undefined))).toBe(36.98);
  });

  it('acepta ccoberturaint con espacios (CHAR del SP) y redondea a 2 decimales', () => {
    const rows = [
      { ccoberturaint: '15 ', prima: 10.005 },
      { ccoberturaint: ' 17', prima: 20.001 },
    ];
    expect(sumPrimaCuotaInicial(rows, parseCoberturasCuotaInicial('15,17'))).toBe(30.01);
  });

  it('sin esas coberturas devuelve 0', () => {
    expect(sumPrimaCuotaInicial([{ ccoberturaint: '23', prima: 50 }], parseCoberturasCuotaInicial(undefined))).toBe(0);
  });
});
