import { CollectionPaymentDto } from './dto/collection-payment.dto';

/** Teléfono origen del pago: acepta `telefono` o `xtelefono` (legacy). */
export function collectionPaymentTelefono(
  body: Pick<CollectionPaymentDto, 'telefono' | 'xtelefono'>,
): string | null {
  const value = body.telefono?.trim() || body.xtelefono?.trim();
  return value || null;
}

/** Cédula/RIF del pagador: acepta `cedula` o `cci_rif` (legacy). */
export function collectionPaymentCedula(
  body: Pick<CollectionPaymentDto, 'cedula' | 'cci_rif'>,
): string | null {
  const value = body.cedula?.trim() || body.cci_rif?.trim();
  return value || null;
}
