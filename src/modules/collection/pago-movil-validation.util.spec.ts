import {
  hasPagoMovilDuplicateLookupFields,
  PAGO_MOVIL_ALREADY_VALIDATED_MESSAGE,
} from './pago-movil-validation.util';

describe('hasPagoMovilDuplicateLookupFields', () => {
  const complete = {
    xtelefono: '584241930116',
    cbanco_ref: '0191',
    cci_rif: 'V-28002498',
    xreferencia: '123212',
  };

  it('devuelve true cuando vienen referencia, teléfono, banco y cédula', () => {
    expect(hasPagoMovilDuplicateLookupFields(complete)).toBe(true);
  });

  it('devuelve false si falta xtelefono', () => {
    expect(hasPagoMovilDuplicateLookupFields({ ...complete, xtelefono: '  ' })).toBe(false);
  });

  it('no exige mpago', () => {
    expect(
      hasPagoMovilDuplicateLookupFields({
        ...complete,
        xreferencia: '219551279300',
      }),
    ).toBe(true);
  });
});

describe('PAGO_MOVIL_ALREADY_VALIDATED_MESSAGE', () => {
  it('está definido', () => {
    expect(PAGO_MOVIL_ALREADY_VALIDATED_MESSAGE).toContain('validado');
  });
});
