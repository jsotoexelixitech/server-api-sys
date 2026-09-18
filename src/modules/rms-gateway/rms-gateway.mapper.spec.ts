import {
  buildPolizaWebhookPayload,
  parseRamosPermitidos,
} from './rms-gateway.mapper';

describe('rms-gateway.mapper', () => {
  it('usa cid de maclient cuando no hay icedula', () => {
    const body = buildPolizaWebhookPayload({
      cnpoliza: '45-1-1100015761',
      cid_tomador: 'V-111',
      cid_aseg: 'V-222',
      cid_ben: 'V-333',
      xtomador: 'TOMADOR QA',
      xasegurado: 'ASEGURADO QA',
      xbeneficiario: 'BENEF QA',
    });
    expect(body?.poliza_detalle.poliza.ctendor).toBe('V-111');
    expect(body?.poliza_detalle.poliza.casegurado).toBe('V-222');
    expect(body?.poliza_detalle.poliza.cbeneficiario).toBe('V-333');
  });

  it('arma tomador, titular, asegurado y beneficiario sin vehículo', () => {
    const body = buildPolizaWebhookPayload({
      cnpoliza: '45-1-1100015761',
      cpoliza: '4500000000000167886',
      cramo: 45,
      ctendor: 111,
      casegurado: 222,
      cbeneficiario: 333,
      icedula_tomador: 'V',
      icedula_aseg: 'V',
      icedula_ben: 'V',
      cci_rif_tomador: 111,
      cci_rif_aseg: 222,
      cci_rif_ben: 333,
      xtomador: 'TOMADOR QA',
      xasegurado: 'ASEGURADO QA',
      xbeneficiario: 'BENEF QA',
      iestado: 'V',
    });
    expect(body?.poliza_detalle.poliza.xtenedor).toBe('TOMADOR QA');
    expect(body?.poliza_detalle.poliza.xtitular).toBe('ASEGURADO QA');
    expect(body?.poliza_detalle.poliza.xasegurado).toBe('ASEGURADO QA');
    expect(body?.poliza_detalle.poliza.xbeneficiario).toBe('BENEF QA');
    expect(body?.poliza_detalle.poliza).not.toHaveProperty('cmarca');
    const tipos = body?.poliza_detalle.riesgo.map((p) => p.Tipo_pers);
    expect(tipos).toEqual(['tomador', 'titular', 'asegurado', 'beneficiario']);
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
