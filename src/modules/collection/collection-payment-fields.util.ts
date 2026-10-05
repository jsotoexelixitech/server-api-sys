import { CollectionPaymentDto } from './dto/collection-payment.dto';

export function collectionPaymentTelefono(
  body: Pick<CollectionPaymentDto, 'xtelefono'>,
): string | null {
  const value = body.xtelefono?.trim();
  return value || null;
}

export function collectionPaymentCedula(
  body: Pick<CollectionPaymentDto, 'cci_rif'>,
): string | null {
  const value = body.cci_rif?.trim();
  return value || null;
}
