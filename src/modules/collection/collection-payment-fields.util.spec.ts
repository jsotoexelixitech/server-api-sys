import {
  collectionPaymentCedula,
  collectionPaymentTelefono,
} from './collection-payment-fields.util';

describe('collectionPaymentTelefono', () => {
  it('devuelve xtelefono recortado', () => {
    expect(collectionPaymentTelefono({ xtelefono: ' 584243678907 ' })).toBe('584243678907');
  });

  it('devuelve null si xtelefono está vacío', () => {
    expect(collectionPaymentTelefono({ xtelefono: '  ' })).toBeNull();
  });
});

describe('collectionPaymentCedula', () => {
  it('devuelve cci_rif recortado', () => {
    expect(collectionPaymentCedula({ cci_rif: 'V-24174934' })).toBe('V-24174934');
  });

  it('devuelve null si cci_rif no viene', () => {
    expect(collectionPaymentCedula({ cci_rif: undefined })).toBeNull();
  });
});
