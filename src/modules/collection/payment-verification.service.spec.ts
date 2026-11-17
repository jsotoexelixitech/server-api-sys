import {
  evaluarRegistros,
  montoTolerancia,
  type RegistroPagoRow,
} from './payment-verification.service';

describe('evaluarRegistros', () => {
  it('sin filas → not_found (no verificado)', () => {
    const r = evaluarRegistros([], 1000);
    expect(r.verified).toBe(false);
    expect(r.reason).toBe('not_found');
  });

  it('SyPago ACCP con monto igual → verificado', () => {
    const rows: RegistroPagoRow[] = [{ proveedor: 'sypago', estado: 'ACCP', monto: 33200.33 }];
    const r = evaluarRegistros(rows, 33200.33);
    expect(r.verified).toBe(true);
    expect(r.reason).toBe('ok');
  });

  it('SyPago PEND → pending (no verificado)', () => {
    const rows: RegistroPagoRow[] = [{ proveedor: 'sypago', estado: 'PEND', monto: 33200.33 }];
    const r = evaluarRegistros(rows, 33200.33);
    expect(r.verified).toBe(false);
    expect(r.reason).toBe('pending');
  });

  it('SyPago RJCT → pending (no verificado)', () => {
    const rows: RegistroPagoRow[] = [{ proveedor: 'sypago', estado: 'RJCT', monto: 33200.33 }];
    const r = evaluarRegistros(rows, 33200.33);
    expect(r.verified).toBe(false);
  });

  it('pago móvil (bancamiga) con solo presencia de fila → verificado', () => {
    const rows: RegistroPagoRow[] = [{ proveedor: 'bancamiga', estado: null, monto: 500 }];
    const r = evaluarRegistros(rows, 500);
    expect(r.verified).toBe(true);
  });

  it('ACCP pero monto muy distinto → amount_mismatch', () => {
    const rows: RegistroPagoRow[] = [{ proveedor: 'sypago', estado: 'ACCP', monto: 100 }];
    const r = evaluarRegistros(rows, 33200.33);
    expect(r.verified).toBe(false);
    expect(r.reason).toBe('amount_mismatch');
  });

  it('ACCP con diferencia menor a la tolerancia → verificado', () => {
    const rows: RegistroPagoRow[] = [{ proveedor: 'sypago', estado: 'ACCP', monto: 33200.0 }];
    const r = evaluarRegistros(rows, 33200.33);
    expect(r.verified).toBe(true);
  });

  it('monto string (de pg numeric) se interpreta', () => {
    const rows: RegistroPagoRow[] = [{ proveedor: 'sypago', estado: 'ACCP', monto: '1000.00' }];
    const r = evaluarRegistros(rows, 1000);
    expect(r.verified).toBe(true);
  });

  it('varias filas: una ACCP entre PEND → verificado', () => {
    const rows: RegistroPagoRow[] = [
      { proveedor: 'sypago', estado: 'PEND', monto: 1000 },
      { proveedor: 'sypago', estado: 'ACCP', monto: 1000 },
    ];
    const r = evaluarRegistros(rows, 1000);
    expect(r.verified).toBe(true);
  });

  it('amountVes 0 (desconocido) no exige coincidencia de monto', () => {
    const rows: RegistroPagoRow[] = [{ proveedor: 'sypago', estado: 'ACCP', monto: 999 }];
    const r = evaluarRegistros(rows, 0);
    expect(r.verified).toBe(true);
  });
});

describe('montoTolerancia', () => {
  it('es al menos 1 Bs', () => {
    expect(montoTolerancia(0)).toBe(1);
    expect(montoTolerancia(10)).toBe(1);
  });
  it('es 1% para montos grandes', () => {
    expect(montoTolerancia(100000)).toBe(1000);
  });
});
