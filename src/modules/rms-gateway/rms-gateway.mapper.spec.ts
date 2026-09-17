import {
  buildPolizaWebhookPayload,
  parseRamosPermitidos,
} from './rms-gateway.mapper';

describe('rms-gateway.mapper', () => {
  it('arma poliza_detalle.poliza desde el SP de endosos', () => {
    const body = buildPolizaWebhookPayload({
      cnpoliza: '45-1-1100011469',
      cpoliza: '4500000000000189401',
      cramo: 45,
      icedula: 'V',
      cci_rif: 12345678,
      xcliente: 'ANA PEREZ',
      fdesde: '2026-01-01',
      fhasta: '2026-12-31',
      iestado: 'V',
    });
    expect(body?.cpoliza).toBe('4500000000000189401');
    expect(body?.poliza).toBe('45-1-1100011469');
    expect(body?.poliza_detalle.poliza.poliza).toBe('45-1-1100011469');
    expect(body?.poliza_detalle.poliza.ctendor).toBe('V-12345678');
    expect(body?.poliza_detalle.poliza.cramo).toBe(45);
    expect(body?.poliza_detalle.poliza.iestado).toBe('V');
  });

  it('sin identificadores no arma payload', () => {
    expect(buildPolizaWebhookPayload({ xcliente: 'X' })).toBeNull();
  });

  it('parsea ramos permitidos', () => {
    expect([...parseRamosPermitidos('5,7,45')].sort((a, b) => a - b)).toEqual([
      5, 7, 45,
    ]);
  });
});
