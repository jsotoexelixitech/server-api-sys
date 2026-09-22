import {
  collectionPaymentCedula,
  collectionPaymentTelefono,
} from './collection-payment-fields.util';

describe('collectionPaymentTelefono', () => {
  it('prioriza telefono sobre xtelefono', () => {
    expect(
      collectionPaymentTelefono({ telefono: ' 58412 ', xtelefono: '0414' }),
    ).toBe('58412');
  });

  it('usa xtelefono si telefono no viene', () => {
    expect(collectionPaymentTelefono({ xtelefono: '584243678907' })).toBe('584243678907');
  });

  it('devuelve null si ambos están vacíos', () => {
    expect(collectionPaymentTelefono({ telefono: '  ', xtelefono: '' })).toBeNull();
  });
});

describe('collectionPaymentCedula', () => {
  it('prioriza cedula sobre cci_rif', () => {
    expect(collectionPaymentCedula({ cedula: 'V-1', cci_rif: 'V-2' })).toBe('V-1');
  });

  it('usa cci_rif si cedula no viene', () => {
    expect(collectionPaymentCedula({ cci_rif: 'V-24174934' })).toBe('V-24174934');
  });

  it('devuelve null si ambos están vacíos', () => {
    expect(collectionPaymentCedula({ cedula: '', cci_rif: undefined })).toBeNull();
  });
});
