import {
  hasPagoMovilDuplicateLookupFields,
  PAGO_MOVIL_ALREADY_VALIDATED_MESSAGE,
} from './pago-movil-validation.util';

describe('hasPagoMovilDuplicateLookupFields', () => {
  const complete = {
    xtelefono: '584241930116',
    mpago: 32025.3,
    cbanco_ref: '0191',
    cci_rif: 'V-28002498',
    xreferencia: '123212',
  };

  it('devuelve true cuando vienen los cinco campos', () => {
    expect(hasPagoMovilDuplicateLookupFields(complete)).toBe(true);
  });

  it('devuelve false si falta xtelefono', () => {
    expect(hasPagoMovilDuplicateLookupFields({ ...complete, xtelefono: '  ' })).toBe(false);
  });

  it('devuelve false si mpago es inválido', () => {
    expect(hasPagoMovilDuplicateLookupFields({ ...complete, mpago: 0 })).toBe(false);
  });
});

describe('PAGO_MOVIL_ALREADY_VALIDATED_MESSAGE', () => {
  it('está definido', () => {
    expect(PAGO_MOVIL_ALREADY_VALIDATED_MESSAGE).toContain('validado');
  });
});
